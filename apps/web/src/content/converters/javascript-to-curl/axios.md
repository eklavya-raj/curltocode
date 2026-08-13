---
direction: code-to-curl
slug: javascript-to-curl/axios
parent: javascript-to-curl
title: JavaScript Axios to cURL Converter | CurlToCode
description: Convert static JavaScript Axios requests to cURL locally, including config objects, method helpers, params, headers, JSON data, auth, and redirects.
heading: Convert JavaScript Axios to cURL
eyebrow: Axios request parser
lede: Parse axios(), axios.request(), or Axios method helpers into a conventional cURL command while keeping your source and credentials inside the browser.
language: javascript
client: axios
languageLabel: JavaScript
clientLabel: Axios
order: 112
faqs:
  - question: Which Axios call styles are supported?
    answer: The parser reads the main Axios function, axios.request with a configuration object, and common helpers such as axios.get and axios.post when their request values are statically knowable.
  - question: How does Axios auth become cURL authentication?
    answer: A static Axios auth object is normalized as basic authentication and generated with cURL's user option. A literal Authorization header is preserved as a header instead.
  - question: Are Axios response options included in the cURL command?
    answer: Response-only behavior has no request equivalent and is not silently discarded when it could change semantics. Unsupported meaningful configuration is reported as a limitation.
related:
  - javascript-to-curl/fetch
  - javascript-to-curl
  - typescript-to-curl/axios
  - curl-to-javascript/axios
---

## Axios call shapes

Axios supports both a single configuration object and convenience methods. The
parser reads static calls such as `axios({ method, url, headers, data })`,
`axios.request(config)`, `axios.get(url, config)`, and
`axios.post(url, data, config)`. Imported Axios aliases are recognized when their
relationship to the package is statically visible.

The `params` object becomes URL query parameters. The `headers` object becomes
ordered normalized headers, while `auth: { username, password }` becomes basic
authentication. Static object or array data is serialized as JSON in the same
way the supported Axios request representation describes it.

## Axios defaults versus cURL defaults

Axios follows redirects in its common Node.js adapter, while cURL only follows
when `-L` is present. The normalized redirect setting prevents those different
defaults from changing the request silently. Explicit method helpers are mapped
to their HTTP method even when the method is absent from the configuration.

Headers and query values are shell-escaped by the reusable cURL generator. That
keeps apostrophes and Unicode readable without interpolating them into a command
unsafely.

## Instances, interceptors, and dynamic configuration

An Axios instance can inherit a base URL, headers, transforms, and interceptors
from code outside the pasted call. Those runtime effects cannot be recovered
honestly from an isolated expression. Paste a self-contained static request or
replace inherited values with literals before converting.

Likewise, a spread from a mutable object or a computed `data` expression is
reported rather than guessed. This protects against producing a plausible cURL
command that omits authentication or sends a different body.
