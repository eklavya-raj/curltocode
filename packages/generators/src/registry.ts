import { CLibcurlGenerator, CprGenerator } from "./forward/c.js";
import { CfhttpGenerator } from "./forward/cfml.js";
import { CljHttpGenerator } from "./forward/clojure.js";
import { CrystalHttpClientGenerator } from "./forward/crystal.js";
import { HTTPoisonGenerator, ReqGenerator } from "./forward/elixir.js";
import { JuliaHttpGenerator } from "./forward/julia.js";
import { LuaHttpGenerator } from "./forward/lua.js";
import { MatlabGenerator } from "./forward/matlab.js";
import { NimHttpClientGenerator } from "./forward/nim.js";
import { CohttpGenerator } from "./forward/ocaml.js";
import { LwpGenerator } from "./forward/perl.js";
import { Httr2Generator, HttrGenerator } from "./forward/r.js";
import { SttpGenerator } from "./forward/scala.js";
import type { HttpRequest } from "@curltocode/core";

import { AiohttpGenerator } from "./forward/aiohttp.js";
import { AlamofireGenerator } from "./forward/alamofire.js";
import { AnsibleGenerator } from "./forward/ansible.js";
import { ApacheHttpClientGenerator } from "./forward/apache-httpclient.js";
import { JQueryGenerator, XhrGenerator } from "./forward/browser-legacy.js";
import { CsharpGenerator } from "./forward/csharp.js";
import { DartHttpGenerator, DioGenerator } from "./forward/dart.js";
import { FaradayGenerator } from "./forward/faraday.js";
import { FlurlGenerator } from "./forward/flurl.js";
import { GoGenerator } from "./forward/go.js";
import { GuzzleGenerator } from "./forward/guzzle.js";
import { HarGenerator } from "./forward/har.js";
import { HttpMessageGenerator } from "./forward/http.js";
import { HttpieGenerator } from "./forward/httpie.js";
import { JavaGenerator } from "./forward/java.js";
import { JavaUrlConnectionGenerator } from "./forward/java-urlconnection.js";
import { JavaScriptGenerator } from "./forward/javascript.js";
import { JsonRequestGenerator } from "./forward/json.js";
import { K6Generator } from "./forward/k6.js";
import { KotlinOkHttpGenerator } from "./forward/kotlin.js";
import { KtorGenerator } from "./forward/ktor.js";
import { NodeHttpsGenerator } from "./forward/node-https.js";
import {
  GotGenerator,
  KyGenerator,
  NodeAxiosGenerator,
  NodeFetchGenerator,
} from "./forward/nodejs.js";
import { ObjectiveCGenerator } from "./forward/objectivec.js";
import { PhpGenerator } from "./forward/php.js";
import {
  LaravelHttpGenerator,
  SymfonyHttpClientGenerator,
} from "./forward/php-clients.js";
import { PostmanGenerator } from "./forward/postman.js";
import { PowerShellGenerator } from "./forward/powershell.js";
import { PythonHttpClientGenerator } from "./forward/python-stdlib.js";
import { PythonGenerator } from "./forward/python.js";
import { RestSharpGenerator } from "./forward/restsharp.js";
import { RestyGenerator } from "./forward/resty.js";
import {
  HTTPartyGenerator,
  RestClientGenerator,
} from "./forward/ruby-clients.js";
import { RubyGenerator } from "./forward/ruby.js";
import { RustGenerator } from "./forward/rust.js";
import { SuperagentGenerator } from "./forward/superagent.js";
import { SwiftUrlSessionGenerator } from "./forward/swift.js";
import { UndiciGenerator } from "./forward/undici.js";
import { UreqGenerator } from "./forward/ureq.js";
import { Urllib3Generator } from "./forward/urllib3.js";
import { WgetGenerator } from "./forward/wget.js";
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
  new JQueryGenerator(),
  new XhrGenerator(),
  new NodeFetchGenerator(),
  new NodeAxiosGenerator(),
  new GotGenerator(),
  new KyGenerator(),
  new SuperagentGenerator(),
  new NodeHttpsGenerator(),
  new PythonGenerator("requests"),
  new PythonGenerator("httpx"),
  new AiohttpGenerator(),
  new PythonHttpClientGenerator(),
  new Urllib3Generator(),
  new GoGenerator(),
  new RestyGenerator(),
  new PhpGenerator(),
  new GuzzleGenerator(),
  new SymfonyHttpClientGenerator(),
  new LaravelHttpGenerator(),
  new JavaGenerator("httpclient"),
  new JavaGenerator("okhttp"),
  new ApacheHttpClientGenerator(),
  new JavaUrlConnectionGenerator(),
  new CsharpGenerator(),
  new RestSharpGenerator(),
  new FlurlGenerator(),
  new RubyGenerator(),
  new FaradayGenerator(),
  new HTTPartyGenerator(),
  new RestClientGenerator(),
  new RustGenerator(),
  new UreqGenerator(),
  new KotlinOkHttpGenerator(),
  new KtorGenerator(),
  new SwiftUrlSessionGenerator(),
  new AlamofireGenerator(),
  new DartHttpGenerator(),
  new DioGenerator(),
  new ObjectiveCGenerator(),
  new CLibcurlGenerator(),
  new CprGenerator(),
  new CljHttpGenerator(),
  new ReqGenerator(),
  new HTTPoisonGenerator(),
  new LwpGenerator(),
  new Httr2Generator(),
  new HttrGenerator(),
  new JuliaHttpGenerator(),
  new LuaHttpGenerator(),
  new MatlabGenerator(),
  new CohttpGenerator(),
  new SttpGenerator(),
  new CfhttpGenerator(),
  new NimHttpClientGenerator(),
  new CrystalHttpClientGenerator(),
  new PowerShellGenerator("restmethod"),
  new PowerShellGenerator("webrequest"),
  new HttpMessageGenerator(),
  new HttpieGenerator(),
  new WgetGenerator(),
  new HarGenerator(),
  new JsonRequestGenerator(),
  new AnsibleGenerator(),
  new PostmanGenerator(),
  new K6Generator(),
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
