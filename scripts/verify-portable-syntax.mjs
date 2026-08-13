import { spawnSync } from "node:child_process";

import { parseCurl } from "../packages/core/dist/index.js";
import { generateCode } from "../packages/generators/dist/index.js";

const GO_FORMAT_ENDPOINT = "https://go.dev/_/fmt";
const PHP_WASM_PACKAGE_VERSION = "3.1.49";

const accountPatch =
  "curl 'https://api.example.com/v1/accounts/acc_42' " +
  "-X PATCH " +
  "-H 'Content-Type: application/json' " +
  "-H 'Authorization: Bearer tok_live_123' " +
  "-b 'session=sess_abc; locale=en-IN' " +
  `--data-raw '{"displayName":"Eklavya 👋","active":true,"roles":["admin","developer"]}'`;

const hostile =
  `curl 'https://example.com/😀?line=one%0Atwo' ` +
  `-X POST ` +
  `-H 'Content-Type: application/json' ` +
  `-H 'X-Value: quote" and slash\\' ` +
  `-u 'ada:s#{ecret}' ` +
  `--data-raw '{"message":"line\\n😀","path":"C:\\\\tmp","dollar":"$var"}'`;

const generate = (curl, id) => generateCode(parseCurl(curl).request, id).code;

async function checkGo(id, curl) {
  // The official formatter parses source without compiling or executing the
  // represented HTTP request. Only deterministic repository fixtures are sent.
  const body = new URLSearchParams({
    body: generate(curl, id),
    imports: "true",
  });
  const response = await fetch(GO_FORMAT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `${id}: Go formatter returned HTTP ${String(response.status)}`,
    );
  }

  const result = await response.json();
  if (
    typeof result !== "object" ||
    result === null ||
    typeof result.Error !== "string"
  ) {
    throw new Error(`${id}: Go formatter returned an invalid response`);
  }
  if (result.Error !== "") {
    throw new Error(`${id}: ${result.Error}`);
  }

  console.log(`passed: ${id} (go.dev formatter)`);
}

function checkPhp(id, curl) {
  // PHP's real -l mode runs in the official WordPress PHP WebAssembly runtime.
  // It parses stdin only and never executes the generated request.
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(
    npm,
    [
      "exec",
      "--yes",
      `--package=@php-wasm/cli@${PHP_WASM_PACKAGE_VERSION}`,
      "--",
      "php-wasm-cli",
      "-l",
    ],
    { input: generate(curl, id), encoding: "utf8" },
  );

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${id}: PHP lint failed\n${result.stderr || result.stdout}`,
    );
  }

  console.log(`passed: ${id} (PHP 8.5 WebAssembly lint)`);
}

await checkGo("go-nethttp", accountPatch);
await checkGo("go-resty", accountPatch);
checkPhp("php-curl", accountPatch);
checkPhp("php-guzzle", accountPatch);

// These two cases correspond to the older hostile-escaping syntax checks.
await checkGo("go-nethttp", hostile);
checkPhp("php-curl", hostile);

console.log("Portable syntax validation passed: 6 checks.");
