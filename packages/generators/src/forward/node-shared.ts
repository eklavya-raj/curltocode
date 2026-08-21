import type { MultipartPart, RequestBody } from "@curltocode/core";

import { GeneratorError } from "../types.js";

/**
 * Body construction shared by the Node.js clients.
 *
 * This is the one thing that separates a Node target from the browser target
 * of the same library: the browser cannot resolve a local file path, so it has
 * to refuse `-F field=@file` and `--data-binary @file`, while Node reads them
 * with `node:fs` and preserves the request exactly.
 */
export const js = (value: string): string => JSON.stringify(value);

export interface NodeBody {
  /** Named imports required from `node:fs`, if any. */
  readonly fsImports: readonly string[];
  /** Statements emitted before the request is built. */
  readonly prelude: readonly string[];
  /** Expression to send as the payload. */
  readonly expression?: string;
}

/**
 * `openAsBlob` gives a `Blob` backed by the file rather than reading it into
 * memory, which is what both `fetch` and a native `FormData` want.
 */
function fileBlob(path: string, contentType: string | undefined): string {
  const options =
    contentType === undefined ? "" : `, { type: ${js(contentType)} }`;
  return `await openAsBlob(${js(path)}${options})`;
}

export function nodeMultipartBody(parts: readonly MultipartPart[]): NodeBody {
  const fsImports: string[] = [];
  const lines = ["const formData = new FormData();"];
  for (const part of parts) {
    if (part.kind === "field") {
      lines.push(`formData.append(${js(part.name)}, ${js(part.value)});`);
      continue;
    }
    fsImports.push("openAsBlob");
    const filename = part.filename ?? part.path.split("/").at(-1) ?? part.path;
    lines.push(
      `formData.append(${js(part.name)}, ${fileBlob(part.path, part.contentType)}, ${js(filename)});`,
    );
  }
  return { fsImports, prelude: lines, expression: "formData" };
}

/**
 * Body for the fetch-shaped Node clients: global `fetch`, `ky`, and anything
 * else that takes a `BodyInit`.
 */
export function nodeBody(
  body: RequestBody | undefined,
  contentType: string | undefined,
): NodeBody {
  if (body === undefined) return { fsImports: [], prelude: [] };
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return { fsImports: [], prelude: [], expression: js(body.raw) };
  }
  if (body.kind === "text") {
    return { fsImports: [], prelude: [], expression: js(body.value) };
  }
  if (body.kind === "multipart") return nodeMultipartBody(body.parts);
  if (body.source.kind === "inline") {
    return {
      fsImports: [],
      prelude: [],
      expression: `new TextEncoder().encode(${js(body.source.value)})`,
    };
  }
  return {
    fsImports: ["openAsBlob"],
    prelude: [],
    expression: fileBlob(body.source.path, contentType),
  };
}

/** Body for the stream-shaped Node clients: axios, got, superagent. */
export function nodeStreamBody(body: RequestBody | undefined): NodeBody {
  if (body === undefined) return { fsImports: [], prelude: [] };
  if (body.kind === "multipart") return nodeMultipartBody(body.parts);
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return { fsImports: [], prelude: [], expression: js(body.raw) };
  }
  if (body.kind === "text") {
    return { fsImports: [], prelude: [], expression: js(body.value) };
  }
  if (body.source.kind === "inline") {
    return {
      fsImports: [],
      prelude: [],
      expression: `Buffer.from(${js(body.source.value)}, "utf8")`,
    };
  }
  // A stream keeps a large upload off the heap, which is the whole reason these
  // clients accept one.
  return {
    fsImports: ["createReadStream"],
    prelude: [],
    expression: `createReadStream(${js(body.source.path)})`,
  };
}

/** The `node:fs` import line for the names a body needed, if any. */
export function fsImportLine(names: readonly string[]): readonly string[] {
  const unique = [...new Set(names)].sort();
  return unique.length === 0
    ? []
    : [`import { ${unique.join(", ")} } from "node:fs";`];
}

export function rejectBodyOnBodylessMethod(
  method: string,
  body: RequestBody | undefined,
  client: string,
): void {
  if (body !== undefined && (method === "GET" || method === "HEAD")) {
    throw new GeneratorError(
      `${client} does not permit a ${method} request body, but the cURL request includes one.`,
      "GENERATOR_UNSUPPORTED_METHOD_BODY",
    );
  }
}
