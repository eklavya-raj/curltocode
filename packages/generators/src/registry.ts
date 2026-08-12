import type { HttpRequest } from "@curltocode/core";

import { AiohttpGenerator } from "./forward/aiohttp.js";
import { ApacheHttpClientGenerator } from "./forward/apache-httpclient.js";
import { CsharpGenerator } from "./forward/csharp.js";
import { FaradayGenerator } from "./forward/faraday.js";
import { GoGenerator } from "./forward/go.js";
import { GuzzleGenerator } from "./forward/guzzle.js";
import { JavaGenerator } from "./forward/java.js";
import { JavaScriptGenerator } from "./forward/javascript.js";
import { PhpGenerator } from "./forward/php.js";
import { PythonGenerator } from "./forward/python.js";
import { RestSharpGenerator } from "./forward/restsharp.js";
import { RestyGenerator } from "./forward/resty.js";
import { RubyGenerator } from "./forward/ruby.js";
import { RustGenerator } from "./forward/rust.js";
import { UndiciGenerator } from "./forward/undici.js";
import { UreqGenerator } from "./forward/ureq.js";
import type {
  CodeGenerator,
  GeneratedCode,
  GeneratorId,
  GeneratorTarget,
} from "./types.js";

const generators: readonly CodeGenerator[] = [
  new JavaScriptGenerator("javascript", "fetch"),
  new JavaScriptGenerator("javascript", "axios"),
  new UndiciGenerator("javascript"),
  new JavaScriptGenerator("typescript", "fetch"),
  new JavaScriptGenerator("typescript", "axios"),
  new UndiciGenerator("typescript"),
  new PythonGenerator("requests"),
  new PythonGenerator("httpx"),
  new AiohttpGenerator(),
  new GoGenerator(),
  new RestyGenerator(),
  new PhpGenerator(),
  new GuzzleGenerator(),
  new JavaGenerator("httpclient"),
  new JavaGenerator("okhttp"),
  new ApacheHttpClientGenerator(),
  new CsharpGenerator(),
  new RestSharpGenerator(),
  new RubyGenerator(),
  new FaradayGenerator(),
  new RustGenerator(),
  new UreqGenerator(),
];

export const generatorRegistry: ReadonlyMap<GeneratorId, CodeGenerator> =
  new Map(generators.map((generator) => [generator.id, generator]));

/** Stable metadata for consumers that need to present the available targets. */
export const generatorTargets: readonly GeneratorTarget[] = generators.map(
  ({ id, language, client }) => ({ id, language, client }),
);

/** Every registered generator id, for validation and page generation. */
export const generatorIds: readonly GeneratorId[] = generatorTargets.map(
  ({ id }) => id,
);

export function generateCode(
  request: HttpRequest,
  generatorId: GeneratorId,
): GeneratedCode {
  const generator = generatorRegistry.get(generatorId);
  if (generator === undefined)
    throw new Error(`Unknown code generator: ${generatorId}`);
  return generator.generate(request);
}
