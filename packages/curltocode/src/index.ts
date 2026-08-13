import type { CurlParseResult, HttpRequest } from "@curltocode/core";
import { parseCurl as parseCurlInternal } from "@curltocode/core";
import type {
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
} from "@curltocode/generators";

export interface ConvertOptions {
  readonly language: GeneratorLanguage;
  readonly client: GeneratorClient;
}

/** Registered forward-conversion targets in deterministic display order. */
export const supportedTargets: readonly GeneratorTarget[] = generatorTargets;

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

export function requestToCurl(request: HttpRequest): string {
  return generateCurl(request).code;
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
  DynamicIssue,
  DynamicIssueKind,
  GeneratedCode,
  GeneratorClient,
  GeneratorErrorCode,
  GeneratorLanguage,
  GeneratorTarget,
  ReverseClient,
  ReverseLanguage,
  ReverseParseResult,
  StaticRequestDetails,
} from "@curltocode/generators";
export type { ConvertOptions as CurlToCodeOptions };
