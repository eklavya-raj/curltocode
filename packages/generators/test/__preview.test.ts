import { mkdirSync, writeFileSync } from "node:fs";

import { it } from "vitest";

import { parseCurl } from "@curltocode/core";
import { generateCode, generatorIds } from "@curltocode/generators";

const OUT = "/tmp/genout";

const CASES: Readonly<Record<string, string>> = {
  postJson: `curl 'https://api.example.com/users?page=1' -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer tok' --data-raw '{"name":"Eklavya"}'`,
  getAuth: `curl https://api.example.com/me -u alice:s3cret -b 'session=abc' -L`,
  multipart: `curl https://api.example.com/upload -F 'note=hello' -F 'file=@/tmp/a.png;type=image/png'`,
  form: `curl https://api.example.com/login -d 'user=a' -d 'pass=b'`,
  unicode: `curl https://api.example.com/u -X POST --data-raw '{"emoji":"😀","quote":"he said \\"hi\\"","tab":"a\\tb"}'`,
};

const EXTENSIONS: Readonly<Record<string, string>> = {
  "ruby-nethttp": "rb",
  "java-httpclient": "java",
  "python-requests": "py",
  "python-httpx": "py",
  "javascript-fetch": "mjs",
  "javascript-axios": "mjs",
  "javascript-undici": "mjs",
  "typescript-undici": "mjs",
  "go-nethttp": "go",
  "go-resty": "go",
  "php-curl": "php",
  "php-guzzle": "php",
  "java-apache": "java",
  "rust-reqwest": "rs",
  "rust-ureq": "rs",
  "csharp-httpclient": "cs",
  "csharp-restsharp": "cs",
  "python-aiohttp": "py",
  "ruby-faraday": "rb",
};

it("writes generated files for external syntax checks", () => {
  mkdirSync(OUT, { recursive: true });
  for (const [name, command] of Object.entries(CASES)) {
    const request = parseCurl(command).request;
    for (const id of generatorIds) {
      const extension = EXTENSIONS[id];
      if (extension === undefined) continue;
      let output: string;
      try {
        output = generateCode(request, id).code;
      } catch {
        continue;
      }
      // javac requires the file name to match the public class name.
      const base = extension === "java" ? "Main" : `${name}_${id}`;
      mkdirSync(`${OUT}/${name}_${id}`, { recursive: true });
      writeFileSync(`${OUT}/${name}_${id}/${base}.${extension}`, output);
    }
  }
});
