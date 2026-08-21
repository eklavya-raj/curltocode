# curltocode

The future public package for [CurlToCode](https://curltocode.com). It converts
cURL commands to 71 registered targets across browser and server JavaScript,
Python, JVM and mobile languages, systems and scripting languages, CLIs,
automation tools, load-test scripts, and request interchange formats. It also
exposes 30 registered static reverse targets for supported source clients,
PowerShell, HTTPie, Wget, raw HTTP, HAR, Postman, and normalized JSON without
executing code or performing represented network requests.

```ts
import {
  codeToCurl,
  convert,
  parseCurl,
  supportedReverseTargets,
  supportedTargets,
} from "curltocode";

const request = parseCurl("curl https://api.example.com/users");
const python = convert("curl https://api.example.com/users", {
  language: "python",
  client: "requests",
});
const curl = await codeToCurl('fetch("https://api.example.com/users")');
const targetIds = supportedTargets.map(({ id }) => id);
const reverseClients = supportedReverseTargets.map(({ client }) => client);
```

`supportedTargets` and `supportedReverseTargets` are deterministic, read-only
metadata sourced from the same registries used for conversion, so clients can
build selectors without maintaining separate language/client allow lists.

This package is not published yet.
