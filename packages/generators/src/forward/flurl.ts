import { requestUrl } from "@curltocode/core";
import type { HttpRequest } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { csharpString } from "./literal.js";

/** Verbs `HttpMethod` exposes as a static property. */
const NAMED_METHODS = new Set([
  "CONNECT",
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
]);

function methodExpression(method: string): string {
  if (!NAMED_METHODS.has(method)) {
    return `new HttpMethod(${csharpString(method)})`;
  }
  const titled = method.charAt(0) + method.slice(1).toLowerCase();
  return `HttpMethod.${titled}`;
}

/**
 * C# with Flurl.Http, which wraps HttpClient in a fluent URL builder and
 * handles the client lifetime that raw `HttpClient` makes so easy to get wrong.
 */
export class FlurlGenerator implements CodeGenerator {
  readonly id = "csharp-flurl" as const;
  readonly language = "csharp" as const;
  readonly client = "flurl" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: false,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "Flurl's WithHeader replaces an existing value for the same name, so a repeated header name cannot be sent twice.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = request.body;
    const usings = new Set(["Flurl.Http", "System.Net.Http"]);
    const chain: string[] = [];
    const contentType = headers.find(
      (header) => header.name.toLowerCase() === "content-type",
    )?.value;
    // The media type travels on the HttpContent, either because Flurl writes
    // the multipart boundary itself or because StringContent carries it, so
    // repeating it as a request header would set the field twice.
    const bodyOwnsContentType =
      body !== undefined &&
      (body.kind !== "binary" || body.source.kind !== "file");

    for (const header of headers) {
      if (bodyOwnsContentType && header.name.toLowerCase() === "content-type") {
        continue;
      }
      chain.push(
        `    .WithHeader(${csharpString(header.name)}, ${csharpString(header.value)})`,
      );
    }
    if (request.auth?.kind === "basic") {
      chain.push(
        `    .WithBasicAuth(${csharpString(request.auth.username)}, ${csharpString(request.auth.password)})`,
      );
    }
    chain.push(
      `    .WithSettings(settings => settings.Redirects.Enabled = ${request.options.followRedirects})`,
      // Flurl throws on a non-2xx by default; cURL prints whatever came back.
      "    .AllowAnyHttpStatus()",
    );

    let call: string;
    if (body?.kind === "multipart") {
      const parts = body.parts.map((part) => {
        if (part.kind === "field") {
          return `        .AddString(${csharpString(part.name)}, ${csharpString(part.value)})`;
        }
        const filename =
          part.filename ?? part.path.split("/").at(-1) ?? part.path;
        const type =
          part.contentType === undefined
            ? ""
            : `, ${csharpString(part.contentType)}`;
        return `        .AddFile(${csharpString(part.name)}, ${csharpString(part.path)}, ${csharpString(filename)}${type})`;
      });
      call = [
        `    .SendMultipartAsync(${methodExpression(request.method)}, content => content`,
        ...parts,
        "    );",
      ].join("\n");
    } else if (body?.kind === "binary" && body.source.kind === "file") {
      usings.add("System.IO");
      call = `    .SendAsync(${methodExpression(request.method)}, new StreamContent(File.OpenRead(${csharpString(body.source.path)})));`;
    } else if (body === undefined) {
      call = `    .SendAsync(${methodExpression(request.method)});`;
    } else {
      usings.add("System.Text");
      const payload =
        body.kind === "json" || body.kind === "form-urlencoded"
          ? body.raw
          : body.kind === "text"
            ? body.value
            : body.source.kind === "inline"
              ? body.source.value
              : "";
      call = `    .SendAsync(${methodExpression(request.method)}, new StringContent(${csharpString(payload)}, Encoding.UTF8, ${csharpString(contentType ?? "application/octet-stream")}));`;
    }

    return {
      code: [
        ...[...usings].sort().map((entry) => `using ${entry};`),
        "",
        `var response = await ${csharpString(requestUrl(request))}`,
        ...chain,
        call,
        "",
        "Console.WriteLine(await response.GetStringAsync());",
      ].join("\n"),
      language: this.language,
      client: this.client,
      dependency: "dotnet add package Flurl.Http",
    };
  }
}
