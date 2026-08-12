export type CurlToCodeErrorCode =
  | "CURL_UNCLOSED_QUOTE"
  | "CURL_DANGLING_ESCAPE"
  | "CURL_EMPTY_INPUT"
  | "CURL_INVALID_COMMAND"
  | "CURL_MISSING_OPTION_VALUE"
  | "CURL_INVALID_HEADER"
  | "CURL_INVALID_COOKIE"
  | "CURL_INVALID_AUTH"
  | "CURL_INVALID_DATA"
  | "CURL_INVALID_FORM"
  | "CURL_INVALID_URL"
  | "CURL_MISSING_URL"
  | "CURL_MULTIPLE_URLS"
  | "CURL_UNSUPPORTED_OPTION"
  | "VALIDATION_INVALID_METHOD"
  | "VALIDATION_INVALID_REQUEST";

export class CurlToCodeError extends Error {
  constructor(
    readonly code: CurlToCodeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CurlToCodeError";
  }
}

export class CurlTokenizeError extends CurlToCodeError {
  constructor(
    code: "CURL_UNCLOSED_QUOTE" | "CURL_DANGLING_ESCAPE",
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(code, message);
    this.name = "CurlTokenizeError";
  }
}

export class CurlParseError extends CurlToCodeError {
  constructor(code: CurlToCodeErrorCode, message: string) {
    super(code, message);
    this.name = "CurlParseError";
  }
}

export class UnsupportedCurlOptionError extends CurlParseError {
  constructor(readonly option: string) {
    super("CURL_UNSUPPORTED_OPTION", `Unsupported cURL option: ${option}`);
    this.name = "UnsupportedCurlOptionError";
  }
}

export class ValidationError extends CurlToCodeError {
  constructor(
    message: string,
    code:
      | "VALIDATION_INVALID_METHOD"
      | "VALIDATION_INVALID_REQUEST" = "VALIDATION_INVALID_REQUEST",
  ) {
    super(code, message);
    this.name = "ValidationError";
  }
}
