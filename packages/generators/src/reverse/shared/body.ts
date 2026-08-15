import type { MultipartPart, RequestBody } from "@curltocode/core";

/**
 * Body classification shared by the reverse parsers that read a body as plain
 * source text.
 *
 * Languages such as PHP and Go hand over a string and a content type with no
 * marker saying which representation the author meant, unlike JavaScript where
 * `TextEncoder` or `URLSearchParams` names it outright. The content type is the
 * only available signal, so the rules for reading it live in one place.
 */

/** Media types whose payload is meaningfully text rather than opaque bytes. */
function isTextual(contentType: string): boolean {
  const type = contentType.toLowerCase();
  return (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("urlencoded") ||
    type.includes("javascript") ||
    type.includes("x-www-form")
  );
}

function formFields(raw: string): readonly { name: string; value: string }[] {
  return raw.split("&").map((pair) => {
    const separator = pair.indexOf("=");
    const decode = (part: string): string => {
      try {
        return decodeURIComponent(part.replaceAll("+", " "));
      } catch {
        return part;
      }
    };
    return separator < 0
      ? { name: decode(pair), value: "" }
      : {
          name: decode(pair.slice(0, separator)),
          value: decode(pair.slice(separator + 1)),
        };
  });
}

/**
 * Read a string body against its declared content type.
 *
 * With no content type at all, a string that looks exactly like a urlencoded
 * pair list is treated as one, because that is what every client in this family
 * sends by default for that shape.
 */
export function classifyStringBody(
  raw: string,
  contentType: string | undefined,
): RequestBody {
  const type = contentType?.toLowerCase();
  if (type?.includes("json") === true) {
    try {
      const value: unknown = JSON.parse(raw);
      return { kind: "json", value: value as never, raw };
    } catch {
      // A declared JSON type with an unparseable payload stays text rather
      // than being reported as a failure; the bytes are what matter.
      return { kind: "text", value: raw, contentType: type };
    }
  }
  if (
    type?.includes("urlencoded") === true ||
    type?.includes("x-www-form") === true
  ) {
    return { kind: "form-urlencoded", fields: formFields(raw), raw };
  }
  if (
    type === undefined &&
    raw.length > 0 &&
    /^[^=&\s]+=[^&]*(?:&[^=&\s]+=[^&]*)*$/u.test(raw)
  ) {
    return { kind: "form-urlencoded", fields: formFields(raw), raw };
  }
  if (type !== undefined && !isTextual(type)) {
    // An opaque media type describes bytes, which the model spells as binary.
    return {
      kind: "binary",
      source: { kind: "inline", value: raw },
      contentType: type,
    };
  }
  return {
    kind: "text",
    value: raw,
    ...(type === undefined ? {} : { contentType: type }),
  };
}

/** Build a multipart body from ordered name/value pairs. */
export function multipartBody(
  pairs: readonly { readonly name: string; readonly value: string }[],
): RequestBody {
  const parts: MultipartPart[] = pairs.map(({ name, value }) => ({
    kind: "field",
    name,
    value,
  }));
  return { kind: "multipart", parts };
}
