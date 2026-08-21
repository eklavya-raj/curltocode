import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { swiftString } from "./literal.js";
import {
  assertNoBoundaryCollision,
  MULTIPART_CONTENT_TYPE,
  MULTIPART_EPILOGUE,
  multipartPartHeader,
} from "./multipart.js";

interface SwiftBody {
  readonly prelude: readonly string[];
  readonly assignment: string | undefined;
  /** Content-Type the body itself defines, replacing any inbound header. */
  readonly contentType: string | undefined;
}

function multipartBody(
  body: Extract<RequestBody, { kind: "multipart" }>,
): SwiftBody {
  const lines = ["var body = Data()"];
  for (const part of body.parts) {
    lines.push(
      `body.append(Data(${swiftString(multipartPartHeader(part))}.utf8))`,
    );
    if (part.kind === "field") {
      assertNoBoundaryCollision(part.name, part.value);
      lines.push(`body.append(Data(${swiftString(part.value)}.utf8))`);
    } else {
      lines.push(
        `body.append(try Data(contentsOf: URL(fileURLWithPath: ${swiftString(part.path)})))`,
      );
    }
    lines.push(`body.append(Data(${swiftString("\r\n")}.utf8))`);
  }
  lines.push(`body.append(Data(${swiftString(MULTIPART_EPILOGUE)}.utf8))`);
  return {
    prelude: lines,
    assignment: "request.httpBody = body",
    contentType: MULTIPART_CONTENT_TYPE,
  };
}

function swiftBody(body: RequestBody | undefined): SwiftBody {
  if (body === undefined) {
    return { prelude: [], assignment: undefined, contentType: undefined };
  }
  if (body.kind === "multipart") return multipartBody(body);
  const inline = (value: string): SwiftBody => ({
    prelude: [],
    assignment: `request.httpBody = Data(${swiftString(value)}.utf8)`,
    contentType: undefined,
  });
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return inline(body.raw);
  }
  if (body.kind === "text") return inline(body.value);
  if (body.source.kind === "inline") return inline(body.source.value);
  return {
    prelude: [],
    assignment: `request.httpBody = try Data(contentsOf: URL(fileURLWithPath: ${swiftString(body.source.path)}))`,
    contentType: undefined,
  };
}

/**
 * Swift with URLSession, which needs no dependency on Apple platforms and is
 * available server-side through swift-corelibs-foundation.
 */
export class SwiftUrlSessionGenerator implements CodeGenerator {
  readonly id = "swift-urlsession" as const;
  readonly language = "swift" as const;
  readonly client = "urlsession" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "URLRequest.addValue folds a repeated header name into one comma-separated value rather than sending the field twice, which is not equivalent for every header.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = swiftBody(request.body);

    const lines = [
      `var request = URLRequest(url: URL(string: ${swiftString(requestUrl(request))})!)`,
      `request.httpMethod = ${swiftString(request.method)}`,
    ];
    for (const header of headers) {
      if (
        body.contentType !== undefined &&
        header.name.toLowerCase() === "content-type"
      ) {
        continue;
      }
      lines.push(
        `request.setValue(${swiftString(header.value)}, forHTTPHeaderField: ${swiftString(header.name)})`,
      );
    }
    if (body.contentType !== undefined) {
      lines.push(
        `request.setValue(${swiftString(body.contentType)}, forHTTPHeaderField: "Content-Type")`,
      );
    }
    if (body.prelude.length > 0) lines.push("", ...body.prelude);
    if (body.assignment !== undefined) lines.push("", body.assignment);

    // URLSession follows redirects unless a task delegate declines them, so the
    // non-following case needs a real delegate rather than a flag.
    const delegate = request.options.followRedirects
      ? []
      : [
          "final class NoRedirects: NSObject, URLSessionTaskDelegate {",
          "    func urlSession(",
          "        _ session: URLSession,",
          "        task: URLSessionTask,",
          "        willPerformHTTPRedirection response: HTTPURLResponse,",
          "        newRequest request: URLRequest,",
          "        completionHandler: @escaping (URLRequest?) -> Void",
          "    ) {",
          "        completionHandler(nil)",
          "    }",
          "}",
          "",
        ];
    const call = request.options.followRedirects
      ? "let (data, _) = try await URLSession.shared.data(for: request)"
      : "let (data, _) = try await URLSession.shared.data(for: request, delegate: NoRedirects())";

    return {
      code: [
        "import Foundation",
        "",
        ...delegate,
        ...lines,
        "",
        call,
        "print(String(decoding: data, as: UTF8.self))",
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
