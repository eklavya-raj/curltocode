import { createHttpRequest } from "@curltocode/core";
import type { Header, RequestBody } from "@curltocode/core";

import { normalizeHeaders } from "../normalize.js";
import { classifyStringBody } from "../shared/body.js";
import { CodeParseError } from "../types.js";
import type { ReverseClient, ReverseParseResult } from "../types.js";

/**
 * Reverse parsing for `Invoke-RestMethod` and `Invoke-WebRequest`.
 *
 * PowerShell is read rather than tokenized as a shell command: the script that
 * these targets generate binds its headers and body to variables first, so the
 * parameters alone are not enough. Only the two shapes this project emits are
 * resolved — a `@{ }` hashtable literal and a single-quoted or double-quoted
 * string — which covers a pasted script from here and the ordinary hand-written
 * form, and reports anything else rather than guessing at it.
 */

/** A single- or double-quoted PowerShell string starting at `index`. */
function readString(
  source: string,
  index: number,
): { readonly value: string; readonly end: number } | undefined {
  const quote = source[index];
  if (quote !== "'" && quote !== '"') return undefined;
  let value = "";
  let cursor = index + 1;
  while (cursor < source.length) {
    const character = source[cursor]!;
    if (character === quote) {
      // A doubled quote is the escape in both forms.
      if (source[cursor + 1] === quote) {
        value += quote;
        cursor += 2;
        continue;
      }
      return { value, end: cursor + 1 };
    }
    if (quote === '"' && character === "`") {
      // The backtick escape only applies inside a double-quoted string.
      const next = source[cursor + 1];
      const escapes: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        "0": "\0",
        "`": "`",
        '"': '"',
        $: "$",
      };
      value += next === undefined ? "`" : (escapes[next] ?? next);
      cursor += 2;
      continue;
    }
    value += character;
    cursor += 1;
  }
  return undefined;
}

/** Every `'key' = 'value'` pair inside the hashtable assigned to `name`. */
function readHashtable(source: string, name: string): readonly Header[] {
  const assignment = new RegExp(String.raw`\$${name}\s*=\s*@\{`, "u").exec(
    source,
  );
  if (assignment === null) return [];
  let depth = 1;
  let cursor = assignment.index + assignment[0].length;
  const entries: Header[] = [];
  while (cursor < source.length && depth > 0) {
    const character = source[cursor]!;
    if (character === "{") {
      depth += 1;
      cursor += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      cursor += 1;
      continue;
    }
    const key = readString(source, cursor);
    if (key === undefined) {
      cursor += 1;
      continue;
    }
    const rest = source.slice(key.end);
    const equals = /^\s*=\s*/u.exec(rest);
    if (equals === null) {
      cursor = key.end;
      continue;
    }
    const valueStart = key.end + equals[0].length;
    const value = readString(source, valueStart);
    if (value === undefined) {
      cursor = valueStart;
      continue;
    }
    entries.push({ name: key.value, value: value.value });
    cursor = value.end;
  }
  return entries;
}

/** The literal or variable given to a named cmdlet parameter. */
function parameter(source: string, name: string): string | undefined {
  const marker = new RegExp(String.raw`-${name}\s+`, "iu").exec(source);
  if (marker === null) return undefined;
  const start = marker.index + marker[0].length;
  const literal = readString(source, start);
  if (literal !== undefined) return literal.value;
  return /^[^\s`]+/u.exec(source.slice(start))?.[0];
}

/**
 * The string a `$name = ...` assignment carries.
 *
 * A body is bound either as a bare literal or wrapped in a conversion such as
 * `[System.Text.Encoding]::UTF8.GetBytes('...')`, which is how a byte payload
 * is written in PowerShell. Both forms hold exactly one string literal on the
 * assignment's own line, so the first one found there is the payload.
 */
function variableString(source: string, name: string): string | undefined {
  const assignment = new RegExp(String.raw`\$${name}\s*=\s*`, "u").exec(source);
  if (assignment === null) return undefined;
  const start = assignment.index + assignment[0].length;
  const direct = readString(source, start);
  if (direct !== undefined) return direct.value;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor]!;
    if (character === "\n") return undefined;
    const literal = readString(source, cursor);
    if (literal !== undefined) return literal.value;
  }
  return undefined;
}

export function parsePowerShellRequest(source: string): ReverseParseResult {
  const cmdlet = /Invoke-(RestMethod|WebRequest)/iu.exec(source);
  if (cmdlet === null) {
    throw new CodeParseError(
      "No Invoke-RestMethod or Invoke-WebRequest call was found in this script.",
    );
  }
  const client: ReverseClient =
    cmdlet[1]?.toLowerCase() === "restmethod" ? "restmethod" : "webrequest";

  const url = parameter(source, "Uri");
  if (url === undefined) {
    throw new CodeParseError("No -Uri was found in this PowerShell command.");
  }
  const method =
    parameter(source, "CustomMethod") ?? parameter(source, "Method") ?? "GET";

  const headerParameter = parameter(source, "Headers");
  const headers: Header[] = headerParameter?.startsWith("$")
    ? [...readHashtable(source, headerParameter.slice(1))]
    : [];
  const contentType = parameter(source, "ContentType");
  if (contentType !== undefined) {
    headers.push({ name: "Content-Type", value: contentType });
  }

  const inFile = parameter(source, "InFile");
  const bodyParameter = parameter(source, "Body");
  const bodyText =
    bodyParameter === undefined
      ? undefined
      : bodyParameter.startsWith("$")
        ? variableString(source, bodyParameter.slice(1))
        : bodyParameter;
  if (
    bodyParameter !== undefined &&
    bodyText === undefined &&
    inFile === undefined
  ) {
    throw new CodeParseError(
      `The -Body value ${bodyParameter} is not a string literal this parser can resolve. Inline the payload as a quoted string.`,
    );
  }

  const normalized = normalizeHeaders(headers);
  const resolvedType = normalized.headers.find(
    (header) => header.name.toLowerCase() === "content-type",
  )?.value;
  const body: RequestBody | undefined =
    inFile !== undefined
      ? {
          kind: "binary",
          source: { kind: "file", path: inFile },
          ...(resolvedType === undefined ? {} : { contentType: resolvedType }),
        }
      : bodyText === undefined
        ? undefined
        : classifyStringBody(bodyText, resolvedType);

  const maximum = parameter(source, "MaximumRedirection");

  return {
    client,
    request: createHttpRequest(url, {
      method: method.toUpperCase(),
      headers: normalized.headers,
      cookies: normalized.cookies,
      ...(normalized.auth === undefined ? {} : { auth: normalized.auth }),
      ...(body === undefined ? {} : { body }),
      // PowerShell follows up to five redirects unless told otherwise.
      followRedirects: maximum === undefined ? true : Number(maximum) > 0,
    }),
  };
}

/** True when the source calls one of the two web cmdlets. */
export function looksLikePowerShell(source: string): boolean {
  return /Invoke-(?:RestMethod|WebRequest)/iu.test(source);
}
