import type { HttpRequest } from "@curltocode/core";

import { CsharpGenerator } from "./forward/csharp.js";
import { GoGenerator } from "./forward/go.js";
import { JavaGenerator } from "./forward/java.js";
import { JavaScriptGenerator } from "./forward/javascript.js";
import { PhpGenerator } from "./forward/php.js";
import { PythonGenerator } from "./forward/python.js";
import { RubyGenerator } from "./forward/ruby.js";
import { RustGenerator } from "./forward/rust.js";
import type {
  CodeGenerator,
  GeneratedCode,
  GeneratorId,
  GeneratorTarget,
} from "./types.js";

const generators: readonly CodeGenerator[] = [
  new JavaScriptGenerator("javascript", "fetch"),
  new JavaScriptGenerator("javascript", "axios"),
  new JavaScriptGenerator("typescript", "fetch"),
  new JavaScriptGenerator("typescript", "axios"),
  new PythonGenerator("requests"),
  new PythonGenerator("httpx"),
  new GoGenerator(),
  new PhpGenerator(),
  new JavaGenerator("httpclient"),
  new JavaGenerator("okhttp"),
  new CsharpGenerator(),
  new RubyGenerator(),
  new RustGenerator(),
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
