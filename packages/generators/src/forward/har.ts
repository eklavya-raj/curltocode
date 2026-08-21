import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";

/**
 * HTTP Archive 1.2, the format browsers, proxies, and load-testing tools all
 * read. The entry describes a request that has not been sent, so the response
 * is written as the empty, status-0 shape those tools already use for a
 * transaction with nothing recorded rather than being invented.
 *
 * `startedDateTime` is required by the specification but generation has to stay
 * deterministic, so it is pinned to the Unix epoch and labelled as a
 * placeholder in the entry comment.
 */
const PLACEHOLDER_STARTED = "1970-01-01T00:00:00.000Z";

interface NameValue {
  readonly name: string;
  readonly value: string;
}

interface PostDataParam {
  readonly name: string;
  readonly value?: string;
  readonly fileName?: string;
  readonly contentType?: string;
}

interface PostData {
  readonly mimeType: string;
  readonly text?: string;
  readonly params?: readonly PostDataParam[];
}

function postData(
  body: RequestBody,
  headerContentType: string | undefined,
): PostData {
  if (body.kind === "json") {
    return {
      mimeType: headerContentType ?? "application/json",
      text: body.raw,
    };
  }
  if (body.kind === "text") {
    return {
      mimeType:
        headerContentType ?? body.contentType ?? "text/plain;charset=UTF-8",
      text: body.value,
    };
  }
  if (body.kind === "form-urlencoded") {
    return {
      mimeType: headerContentType ?? "application/x-www-form-urlencoded",
      // Both are emitted: `params` is what tooling reads, `text` is what was
      // actually going to be sent, byte for byte.
      text: body.raw,
      params: body.fields.map(({ name, value }) => ({ name, value })),
    };
  }
  if (body.kind === "multipart") {
    return {
      mimeType: "multipart/form-data",
      params: body.parts.map((part) =>
        part.kind === "field"
          ? { name: part.name, value: part.value }
          : {
              name: part.name,
              fileName: part.path,
              ...(part.contentType === undefined
                ? {}
                : { contentType: part.contentType }),
            },
      ),
    };
  }
  if (body.source.kind === "file") {
    throw new GeneratorError(
      `A HAR entry carries the request body as text, and the contents of ${body.source.path} are not known here. Inline the payload, or pick a client target that can read the path at runtime.`,
      "GENERATOR_FILE_REFERENCE",
    );
  }
  return {
    mimeType:
      headerContentType ?? body.contentType ?? "application/octet-stream",
    text: body.source.value,
  };
}

export class HarGenerator implements CodeGenerator {
  readonly id = "har-json" as const;
  readonly language = "har" as const;
  readonly client = "json" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    const contentType = headers.find(
      (header) => header.name.toLowerCase() === "content-type",
    )?.value;
    const url = new URL(requestUrl(request));

    const har = {
      log: {
        version: "1.2",
        creator: { name: "CurlToCode", version: "1.0" },
        entries: [
          {
            startedDateTime: PLACEHOLDER_STARTED,
            time: -1,
            request: {
              method: request.method,
              url: url.toString(),
              httpVersion: "HTTP/1.1",
              cookies: request.cookies.map(({ name, value }) => ({
                name,
                value,
              })),
              headers: headers.map(({ name, value }): NameValue => ({
                name,
                value,
              })),
              queryString: Array.from(
                url.searchParams,
                ([name, value]): NameValue => ({ name, value }),
              ),
              ...(request.body === undefined
                ? {}
                : { postData: postData(request.body, contentType) }),
              headersSize: -1,
              bodySize: -1,
            },
            response: {
              status: 0,
              statusText: "",
              httpVersion: "HTTP/1.1",
              cookies: [],
              headers: [],
              content: { size: 0, mimeType: "" },
              redirectURL: "",
              headersSize: -1,
              bodySize: -1,
            },
            cache: {},
            timings: { send: -1, wait: -1, receive: -1 },
            comment:
              "Request only. No response was captured, and startedDateTime is a placeholder.",
          },
        ],
      },
    };

    return {
      code: JSON.stringify(har, null, 2),
      language: this.language,
      client: this.client,
    };
  }
}
