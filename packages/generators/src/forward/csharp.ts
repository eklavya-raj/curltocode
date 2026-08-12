import { requestUrl } from "@curltocode/core";
import type { Header, HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { csharpString } from "./literal.js";

/**
 * .NET rejects these on `HttpRequestMessage.Headers` and requires them on
 * `HttpContent.Headers` instead.
 */
const CONTENT_HEADERS = new Set([
  "allow",
  "content-disposition",
  "content-encoding",
  "content-language",
  "content-length",
  "content-location",
  "content-md5",
  "content-range",
  "content-type",
  "expires",
  "last-modified",
]);

function isContentHeader(header: Header): boolean {
  return CONTENT_HEADERS.has(header.name.toLowerCase());
}

interface CsharpBody {
  readonly lines: readonly string[];
  readonly usings: readonly string[];
}

function bodyStatements(body: RequestBody): CsharpBody {
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return {
      lines: [
        `request.Content = new StringContent(${csharpString(body.raw)}, Encoding.UTF8);`,
      ],
      usings: ["System.Text"],
    };
  }
  if (body.kind === "text") {
    return {
      lines: [
        `request.Content = new StringContent(${csharpString(body.value)}, Encoding.UTF8);`,
      ],
      usings: ["System.Text"],
    };
  }
  if (body.kind === "multipart") {
    const lines = ["var content = new MultipartFormDataContent();"];
    const usings = ["System.Net.Http.Headers"];
    let fileIndex = 0;
    for (const part of body.parts) {
      if (part.kind === "field") {
        lines.push(
          `content.Add(new StringContent(${csharpString(part.value)}), ${csharpString(part.name)});`,
        );
        continue;
      }
      fileIndex += 1;
      const variable = `filePart${fileIndex}`;
      const filename =
        part.filename ?? part.path.split("/").at(-1) ?? part.path;
      lines.push(
        `var ${variable} = new ByteArrayContent(File.ReadAllBytes(${csharpString(part.path)}));`,
      );
      if (part.contentType !== undefined) {
        lines.push(
          `${variable}.Headers.ContentType = MediaTypeHeaderValue.Parse(${csharpString(part.contentType)});`,
        );
      }
      lines.push(
        `content.Add(${variable}, ${csharpString(part.name)}, ${csharpString(filename)});`,
      );
      usings.push("System.IO");
    }
    lines.push("request.Content = content;");
    return { lines, usings };
  }
  if (body.source.kind === "inline") {
    return {
      lines: [
        `request.Content = new ByteArrayContent(Encoding.UTF8.GetBytes(${csharpString(body.source.value)}));`,
      ],
      usings: ["System.Text"],
    };
  }
  return {
    lines: [
      `request.Content = new ByteArrayContent(File.ReadAllBytes(${csharpString(body.source.path)}));`,
    ],
    usings: ["System.IO"],
  };
}

export class CsharpGenerator implements CodeGenerator {
  readonly id = "csharp-httpclient" as const;
  readonly language = "csharp" as const;
  readonly client = "httpclient" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const body =
      request.body === undefined ? undefined : bodyStatements(request.body);
    const usings = new Set([
      "System",
      "System.Net.Http",
      "System.Threading.Tasks",
      ...(body?.usings ?? []),
    ]);

    const handlerSettings: string[] = [];
    if (!request.options.followRedirects)
      handlerSettings.push("AllowAutoRedirect = false");
    // The handler's own cookie container would otherwise compete with an
    // explicit Cookie header.
    if (request.cookies.length > 0) handlerSettings.push("UseCookies = false");

    const lines: string[] = [];
    if (handlerSettings.length > 0) {
      lines.push(
        `using var handler = new HttpClientHandler { ${handlerSettings.join(", ")} };`,
        "using var client = new HttpClient(handler);",
      );
    } else {
      lines.push("using var client = new HttpClient();");
    }
    lines.push(
      `using var request = new HttpRequestMessage(new HttpMethod(${csharpString(request.method)}), ${csharpString(requestUrl(request))});`,
    );

    const requestHeaders = headers.filter((header) => !isContentHeader(header));
    const contentHeaders = headers.filter(isContentHeader);
    if (body === undefined && contentHeaders.length > 0) {
      throw new GeneratorError(
        `HttpClient cannot attach the ${contentHeaders[0]?.name ?? "content"} header without an HTTP content object, and adding one would invent a request body.`,
        "GENERATOR_UNSUPPORTED_BODY",
      );
    }
    for (const header of requestHeaders) {
      // TryAddWithoutValidation allows repeated names and non-standard values.
      lines.push(
        `request.Headers.TryAddWithoutValidation(${csharpString(header.name)}, ${csharpString(header.value)});`,
      );
    }
    if (body !== undefined) {
      lines.push(...body.lines);
      for (const header of contentHeaders) {
        lines.push(
          `request.Content.Headers.Remove(${csharpString(header.name)});`,
          `request.Content.Headers.TryAddWithoutValidation(${csharpString(header.name)}, ${csharpString(header.value)});`,
        );
      }
    }

    lines.push(
      "",
      "var response = await client.SendAsync(request);",
      "Console.WriteLine((int)response.StatusCode);",
      "Console.WriteLine(await response.Content.ReadAsStringAsync());",
    );

    return {
      code: [
        ...[...usings].sort().map((entry) => `using ${entry};`),
        "",
        ...lines,
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
