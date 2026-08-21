import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { swiftString } from "./literal.js";

const DEPENDENCY =
  '.package(url: "https://github.com/Alamofire/Alamofire.git", from: "5.12.0")';

/** Verbs Alamofire exposes as a named `HTTPMethod` constant. */
const NAMED_METHODS = new Map([
  ["CONNECT", "connect"],
  ["DELETE", "delete"],
  ["GET", "get"],
  ["HEAD", "head"],
  ["OPTIONS", "options"],
  ["PATCH", "patch"],
  ["POST", "post"],
  ["PUT", "put"],
  ["QUERY", "query"],
  ["TRACE", "trace"],
]);

function methodExpression(method: string): string {
  const named = NAMED_METHODS.get(method);
  return named === undefined
    ? `HTTPMethod(rawValue: ${swiftString(method)})`
    : `.${named}`;
}

/**
 * Swift with Alamofire.
 *
 * Alamofire's own strength is the upload API, so a multipart or file-backed
 * request goes through `AF.upload` rather than being hand-encoded the way the
 * Foundation target has to do it.
 */
export class AlamofireGenerator implements CodeGenerator {
  readonly id = "swift-alamofire" as const;
  readonly language = "swift" as const;
  readonly client = "alamofire" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "Alamofire's HTTPHeaders keeps names unique case-insensitively, so adding a repeated header name replaces the earlier value instead of sending both.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }

    const lines: string[] = [];
    if (headers.length > 0) {
      lines.push(
        "let headers: HTTPHeaders = [",
        ...headers.map(
          ({ name, value }) =>
            `    ${swiftString(name)}: ${swiftString(value)},`,
        ),
        "]",
        "",
      );
    }
    const headerArgument = headers.length > 0 ? ", headers: headers" : "";
    const url = swiftString(requestUrl(request));
    const method = methodExpression(request.method);
    // `.doNotFollow` is a Redirector, which is the only place Alamofire lets
    // the policy be set for a single request.
    const redirector = request.options.followRedirects
      ? ".follow"
      : ".doNotFollow";

    const body = request.body;
    let call: string;
    if (body?.kind === "multipart") {
      const parts: string[] = [];
      for (const part of body.parts) {
        if (part.kind === "field") {
          parts.push(
            `    form.append(Data(${swiftString(part.value)}.utf8), withName: ${swiftString(part.name)})`,
          );
          continue;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        const type =
          part.contentType === undefined
            ? ""
            : `, mimeType: ${swiftString(part.contentType)}`;
        parts.push(
          `    form.append(`,
          `        URL(fileURLWithPath: ${swiftString(part.path)}),`,
          `        withName: ${swiftString(part.name)},`,
          `        fileName: ${swiftString(filename)}${type},`,
          `    )`,
        );
      }
      call = [
        "let request = AF.upload(multipartFormData: { form in",
        ...parts,
        `}, to: ${url}, method: ${method}${headerArgument})`,
      ].join("\n");
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      call = `let request = AF.upload(URL(fileURLWithPath: ${swiftString(body.source.path)}), to: ${url}, method: ${method}${headerArgument})`;
    } else {
      const payload =
        body === undefined
          ? undefined
          : body.kind === "json" || body.kind === "form-urlencoded"
            ? body.raw
            : body.kind === "text"
              ? body.value
              : body.source.kind === "inline"
                ? body.source.value
                : undefined;
      if (payload === undefined) {
        call = `let request = AF.request(${url}, method: ${method}${headerArgument})`;
      } else {
        // A raw body has to be attached to a URLRequest; Alamofire's parameter
        // encoders would re-serialize it and change the bytes on the wire.
        lines.push(
          `var urlRequest = try URLRequest(url: ${url}, method: ${method}${headerArgument})`,
          `urlRequest.httpBody = Data(${swiftString(payload)}.utf8)`,
          "",
        );
        call = "let request = AF.request(urlRequest)";
      }
    }

    return {
      code: [
        "import Alamofire",
        "import Foundation",
        "",
        ...lines,
        call,
        `    .redirect(using: ${redirector})`,
        "    .validate()",
        "",
        "let data = try await request.serializingData().value",
        "print(String(decoding: data, as: UTF8.self))",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: DEPENDENCY,
    };
  }
}
