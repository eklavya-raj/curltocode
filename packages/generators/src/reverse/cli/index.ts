import { createHttpRequest, tokenizeCurl } from "@curltocode/core";
import type { Header, MultipartPart, RequestBody } from "@curltocode/core";

import { normalizeHeaders } from "../normalize.js";
import { classifyStringBody } from "../shared/body.js";
import { CodeParseError } from "../types.js";
import type { ReverseParseResult } from "../types.js";

/**
 * Reverse parsing for the two command-line targets, HTTPie and Wget.
 *
 * Both are shell commands, so the existing cURL tokenizer does the quoting
 * work and only the option grammar differs. That grammar is small and entirely
 * positional, which makes these the most faithful reverse parsers here after
 * the interchange formats: nothing has to be resolved from a variable.
 */

function tokens(source: string, program: RegExp): readonly string[] {
  const values = tokenizeCurl(source).map((token) => token.value);
  const start = values.findIndex((value) => program.test(value));
  if (start < 0) {
    throw new CodeParseError(
      `No ${program.source.includes("http") ? "HTTPie" : "Wget"} command was found in this input.`,
    );
  }
  return values.slice(start + 1);
}

/* ------------------------------------------------------------- HTTPie */

const HTTPIE_METHOD = /^[A-Za-z!#$%&'*+.^_`|~-]+$/u;

/** Undo the backslash escaping HTTPie uses for a separator inside a name. */
function unescapeItemName(name: string): string {
  return name.replaceAll(/\\([:=@\\])/gu, "$1");
}

/**
 * Split a request item at its first *unescaped* separator.
 *
 * The separator characters may all appear inside a name, so a plain `indexOf`
 * would split `a\=b=1` in the wrong place.
 */
function splitItem(item: string):
  | {
      readonly name: string;
      readonly separator: string;
      readonly value: string;
    }
  | undefined {
  for (let index = 0; index < item.length; index += 1) {
    const character = item[index]!;
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === ":" || character === "=" || character === "@") {
      // `:=` is HTTPie's raw-JSON separator and is two characters long.
      const isRawJson = character === ":" && item[index + 1] === "=";
      const separator = isRawJson ? ":=" : character;
      return {
        name: unescapeItemName(item.slice(0, index)),
        separator,
        value: item.slice(index + separator.length),
      };
    }
  }
  return undefined;
}

export function parseHttpieRequest(source: string): ReverseParseResult {
  const values = tokens(source, /^(?:https?|http|httpie)$/u);
  const headers: Header[] = [];
  const parts: MultipartPart[] = [];
  // Form fields are kept apart from multipart parts: `--form` alone sends a
  // urlencoded body, and only `--multipart` or a file item makes it multipart.
  const formFields: { name: string; value: string }[] = [];
  const jsonFields: Record<string, unknown> = {};
  let method: string | undefined;
  let url: string | undefined;
  let raw: string | undefined;
  let followRedirects = false;
  let multipart = false;
  let auth: { username: string; password: string } | undefined;
  let form = false;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (value === "--follow" || value === "-F") {
      followRedirects = true;
      continue;
    }
    if (value === "--multipart") {
      multipart = true;
      continue;
    }
    if (value === "--form" || value === "-f") {
      form = true;
      continue;
    }
    if (value.startsWith("--raw=")) {
      raw = value.slice("--raw=".length);
      continue;
    }
    if (value === "--raw") {
      raw = values[index + 1];
      index += 1;
      continue;
    }
    if (value.startsWith("--auth=") || value === "--auth" || value === "-a") {
      const credentials = value.startsWith("--auth=")
        ? value.slice("--auth=".length)
        : values[++index];
      if (credentials !== undefined) {
        const separator = credentials.indexOf(":");
        auth =
          separator < 0
            ? { username: credentials, password: "" }
            : {
                username: credentials.slice(0, separator),
                password: credentials.slice(separator + 1),
              };
      }
      continue;
    }
    // Remaining flags carry no request semantics; --auth-type is consumed here
    // because basic is the only scheme this model has.
    if (value.startsWith("-")) {
      if (value === "--auth-type" || value === "-A") index += 1;
      continue;
    }
    if (
      url === undefined &&
      method === undefined &&
      HTTPIE_METHOD.test(value) &&
      splitItem(value) === undefined
    ) {
      method = value.toUpperCase();
      continue;
    }
    if (url === undefined) {
      url = value;
      continue;
    }
    const item = splitItem(value);
    if (item === undefined) continue;
    if (item.separator === ":") {
      // A trailing semicolon on the name is HTTPie's empty-value form.
      if (item.value.length === 0 && item.name.endsWith(";")) {
        headers.push({ name: item.name.slice(0, -1), value: "" });
        continue;
      }
      headers.push({ name: item.name, value: item.value });
      continue;
    }
    if (item.separator === "@") {
      const [path = item.value] = item.value.split(";");
      const options = item.value.slice(path.length);
      const contentType = /;type=([^;]+)/u.exec(options)?.[1];
      const filename = /;filename=([^;]+)/u.exec(options)?.[1];
      parts.push({
        kind: "file",
        name: item.name,
        path,
        ...(filename === undefined ? {} : { filename }),
        ...(contentType === undefined ? {} : { contentType }),
      });
      multipart = true;
      continue;
    }
    if (item.separator === ":=") {
      try {
        jsonFields[item.name] = JSON.parse(item.value);
      } catch {
        jsonFields[item.name] = item.value;
      }
      continue;
    }
    // A plain `name=value` is a form field under --form and a JSON string
    // field otherwise, which is HTTPie's own default.
    if (form || multipart) {
      formFields.push({ name: item.name, value: item.value });
      continue;
    }
    jsonFields[item.name] = item.value;
  }

  if (url === undefined) {
    throw new CodeParseError("No URL was found in this HTTPie command.");
  }
  const normalized = normalizeHeaders(headers);
  const contentType = normalized.headers.find(
    (header) => header.name.toLowerCase() === "content-type",
  )?.value;

  let body: RequestBody | undefined;
  if (parts.length > 0 || (multipart && formFields.length > 0)) {
    body = {
      kind: "multipart",
      parts: [
        ...formFields.map((field): MultipartPart => ({
          kind: "field",
          ...field,
        })),
        ...parts,
      ],
    };
  } else if (raw !== undefined) {
    body = classifyStringBody(raw, contentType);
  } else if (formFields.length > 0) {
    body = classifyStringBody(
      new URLSearchParams(
        formFields.map(({ name, value }) => [name, value]),
      ).toString(),
      "application/x-www-form-urlencoded",
    );
  } else if (Object.keys(jsonFields).length > 0) {
    body = {
      kind: "json",
      value: jsonFields as never,
      raw: JSON.stringify(jsonFields),
    };
  }

  return {
    client: "cli",
    request: createHttpRequest(url, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(auth === undefined
        ? normalized.auth === undefined
          ? {}
          : { auth: normalized.auth }
        : { auth: { kind: "basic" as const, ...auth } }),
      ...(body === undefined ? {} : { body }),
      followRedirects,
    }),
  };
}

/* --------------------------------------------------------------- Wget */

export function parseWgetRequest(source: string): ReverseParseResult {
  const values = tokens(source, /^wget(?:\.exe)?$/u);
  const headers: Header[] = [];
  let url: string | undefined;
  let method: string | undefined;
  let bodyText: string | undefined;
  let bodyFile: string | undefined;
  let username: string | undefined;
  let password: string | undefined;
  // GNU Wget follows up to twenty redirects unless told otherwise.
  let followRedirects = true;

  const take = (
    value: string,
    prefix: string,
    index: number,
  ): { readonly value: string | undefined; readonly next: number } => {
    if (value.startsWith(`${prefix}=`)) {
      return { value: value.slice(prefix.length + 1), next: index };
    }
    return { value: values[index + 1], next: index + 1 };
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (value.startsWith("--method")) {
      const taken = take(value, "--method", index);
      method = taken.value?.toUpperCase();
      index = taken.next;
      continue;
    }
    if (value.startsWith("--header")) {
      const taken = take(value, "--header", index);
      index = taken.next;
      const line = taken.value ?? "";
      const separator = line.indexOf(":");
      if (separator > 0) {
        headers.push({
          name: line.slice(0, separator).trim(),
          value: line.slice(separator + 1).trim(),
        });
      }
      continue;
    }
    if (value.startsWith("--body-data")) {
      const taken = take(value, "--body-data", index);
      bodyText = taken.value;
      index = taken.next;
      continue;
    }
    if (value.startsWith("--body-file")) {
      const taken = take(value, "--body-file", index);
      bodyFile = taken.value;
      index = taken.next;
      continue;
    }
    if (value.startsWith("--user")) {
      const taken = take(value, "--user", index);
      username = taken.value;
      index = taken.next;
      continue;
    }
    if (value.startsWith("--password")) {
      const taken = take(value, "--password", index);
      password = taken.value;
      index = taken.next;
      continue;
    }
    if (value.startsWith("--max-redirect")) {
      const taken = take(value, "--max-redirect", index);
      followRedirects = Number(taken.value ?? "20") > 0;
      index = taken.next;
      continue;
    }
    // -O takes a filename, which says nothing about the request.
    if (value === "-O" || value === "--output-document") {
      index += 1;
      continue;
    }
    if (value.startsWith("-")) continue;
    if (url === undefined) url = value;
  }

  if (url === undefined) {
    throw new CodeParseError("No URL was found in this Wget command.");
  }
  const normalized = normalizeHeaders(headers);
  const contentType = normalized.headers.find(
    (header) => header.name.toLowerCase() === "content-type",
  )?.value;
  const body: RequestBody | undefined =
    bodyFile !== undefined
      ? {
          kind: "binary",
          source: { kind: "file", path: bodyFile },
          ...(contentType === undefined ? {} : { contentType }),
        }
      : bodyText === undefined
        ? undefined
        : classifyStringBody(bodyText, contentType);

  return {
    client: "cli",
    request: createHttpRequest(url, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(username === undefined
        ? normalized.auth === undefined
          ? {}
          : { auth: normalized.auth }
        : {
            auth: {
              kind: "basic" as const,
              username,
              password: password ?? "",
            },
          }),
      ...(body === undefined ? {} : { body }),
      followRedirects,
    }),
  };
}

/** True when the source opens with an HTTPie invocation. */
export function looksLikeHttpie(source: string): boolean {
  return /^\s*https?\s+/u.test(source);
}

/** True when the source opens with a Wget invocation. */
export function looksLikeWget(source: string): boolean {
  return /^\s*wget(?:\.exe)?\s/u.test(source);
}
