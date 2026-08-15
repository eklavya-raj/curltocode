export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export interface Header {
  readonly name: string;
  readonly value: string;
}

export interface QueryParameter {
  readonly name: string;
  readonly value: string;
}

export interface Cookie {
  readonly name: string;
  readonly value: string;
}

export type RequestAuth =
  | {
      readonly kind: "basic";
      readonly username: string;
      readonly password: string;
    }
  | { readonly kind: "bearer"; readonly token: string };

export interface FormField {
  readonly name: string;
  readonly value: string;
}

export type MultipartPart =
  | { readonly kind: "field"; readonly name: string; readonly value: string }
  | {
      readonly kind: "file";
      readonly name: string;
      readonly path: string;
      readonly filename?: string;
      readonly contentType?: string;
    };

export type RequestBody =
  | { readonly kind: "json"; readonly value: JsonValue; readonly raw: string }
  | {
      readonly kind: "text";
      readonly value: string;
      readonly contentType?: string;
    }
  | {
      readonly kind: "form-urlencoded";
      readonly fields: readonly FormField[];
      readonly raw: string;
    }
  | { readonly kind: "multipart"; readonly parts: readonly MultipartPart[] }
  | {
      readonly kind: "binary";
      readonly source:
        | { readonly kind: "inline"; readonly value: string }
        | { readonly kind: "file"; readonly path: string };
      readonly contentType?: string;
    };

export interface RequestOptions {
  readonly followRedirects: boolean;
}

export interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly query: readonly QueryParameter[];
  readonly headers: readonly Header[];
  readonly cookies: readonly Cookie[];
  readonly auth?: RequestAuth;
  readonly body?: RequestBody;
  readonly options: RequestOptions;
}

export interface ParseWarning {
  readonly code:
    | "URL_FRAGMENT_IGNORED"
    | "JSON_CONTENT_TYPE_INVALID"
    | "TRANSPORT_OPTION_IGNORED";
  readonly message: string;
}

export interface CurlParseResult {
  readonly request: HttpRequest;
  readonly warnings: readonly ParseWarning[];
}
