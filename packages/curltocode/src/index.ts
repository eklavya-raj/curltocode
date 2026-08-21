import type { CurlParseResult, HttpRequest } from "@curltocode/core";
import {
  parseCurl as parseCurlInternal,
  splitCurlCommands,
} from "@curltocode/core";
import type {
  InterchangeEntry,
  InterchangeFormat,
} from "@curltocode/generators/reverse";
import type {
  CurlOptions,
  GeneratedCurl,
  GeneratedCode,
  GeneratorClient,
  GeneratorId,
  GeneratorLanguage,
  GeneratorTarget,
  ReverseLanguage,
  ReverseParseResult,
} from "@curltocode/generators";
import {
  generateCode as generateCodeInternal,
  generateCurl,
  generatorIds,
  generatorTargets,
  reverseTargets,
} from "@curltocode/generators";

export interface ConvertOptions {
  readonly language: GeneratorLanguage;
  readonly client: GeneratorClient;
}

/** Registered forward-conversion targets in deterministic display order. */
export const supportedTargets: readonly GeneratorTarget[] = generatorTargets;

/** Forward targets with a matching static Code → cURL parser. */
export const supportedReverseTargets = reverseTargets;

function generatorId(options: ConvertOptions): GeneratorId {
  const id = `${options.language}-${options.client}`;
  // Derived from the registry so a newly registered generator cannot be
  // rejected here by an out-of-date allow list.
  if (!generatorIds.includes(id as GeneratorId)) {
    throw new Error(
      `Unsupported language/client combination: ${options.language}/${options.client}`,
    );
  }
  return id as GeneratorId;
}

export function parseCurl(input: string): HttpRequest {
  return parseCurlInternal(input).request;
}

export function parseCurlDetailed(input: string): CurlParseResult {
  return parseCurlInternal(input);
}

export function generateCode(
  request: HttpRequest,
  options: ConvertOptions,
): string {
  return generateCodeInternal(request, generatorId(options)).code;
}

/**
 * Generate code together with its metadata, including any install command the
 * target client requires. Callers that need the dependency hint should use this
 * rather than maintaining their own client-to-dependency table.
 */
export function generateDetailed(
  request: HttpRequest,
  options: ConvertOptions,
): GeneratedCode {
  return generateCodeInternal(request, generatorId(options));
}

export function convert(input: string, options: ConvertOptions): string {
  return generateCode(parseCurl(input), options);
}

export async function parseCode(
  input: string,
  language?: ReverseLanguage,
): Promise<ReverseParseResult> {
  const { parseCodeRequest } = await import("@curltocode/generators/reverse");
  return parseCodeRequest(input, language);
}

export async function codeToCurl(input: string): Promise<string> {
  return requestToCurl((await parseCode(input)).request);
}

export function requestToCurl(
  request: HttpRequest,
  options: CurlOptions = {},
): string {
  return generateCurl(request, options).code;
}

/**
 * Generate a cURL command together with any environment variables it expects.
 *
 * Use this rather than `requestToCurl` when secrets are lifted out, so the
 * caller can show which variables have to be set before the command will run.
 */
export function requestToCurlDetailed(
  request: HttpRequest,
  options: CurlOptions = {},
): GeneratedCurl {
  return generateCurl(request, options);
}

/**
 * Split a script into the cURL commands it contains.
 *
 * Exposed because a caller converting a scratch file or a browser's "copy all
 * as cURL" export needs the same quoting-aware split the converter uses, and a
 * naive split on newlines would break any command with a multi-line body.
 */
export { splitCurlCommands };

/**
 * List the requests inside a HAR archive, a Postman collection, or a JSON
 * request document, without converting any of them.
 *
 * A HAR export routinely holds hundreds of entries, so a caller needs to see
 * what is in the file before choosing. The parser is loaded lazily, the same
 * way `parseCode` loads it, so the reverse code never lands in a bundle that
 * does not use it.
 */
export async function listRequests(
  input: string,
): Promise<readonly InterchangeEntry[]> {
  const { listInterchangeRequests } =
    await import("@curltocode/generators/reverse");
  return listInterchangeRequests(input);
}

/** The interchange format a document is, when it is one of the three. */
export async function detectInterchangeFormat(
  input: string,
): Promise<InterchangeFormat | undefined> {
  const { looksLikeInterchangeDocument } =
    await import("@curltocode/generators/reverse");
  return looksLikeInterchangeDocument(input);
}

export type {
  Cookie,
  FormField,
  Header,
  HttpRequest,
  JsonValue,
  MultipartPart,
  QueryParameter,
  RequestAuth,
  RequestBody,
} from "@curltocode/core";
export {
  CurlParseError,
  CurlTokenizeError,
  CurlToCodeError,
  UnsupportedCurlOptionError,
  ValidationError,
} from "@curltocode/core";
export {
  CodeParseError,
  DynamicExpressionError,
  GeneratorError,
  REVERSE_CLIENT_LABELS,
} from "@curltocode/generators";
export type {
  CurlOptions,
  DynamicIssue,
  DynamicIssueKind,
  GeneratedCode,
  GeneratedCurl,
  GeneratorClient,
  GeneratorErrorCode,
  GeneratorLanguage,
  GeneratorTarget,
  ReverseClient,
  ReverseLanguage,
  ReverseParseResult,
  ReverseTarget,
  ReverseTargetLanguage,
  StaticRequestDetails,
} from "@curltocode/generators";
export type {
  InterchangeEntry,
  InterchangeFormat,
} from "@curltocode/generators/reverse";
export type { ConvertOptions as CurlToCodeOptions };
