---
slug: curl-to-nodejs
title: cURL to Node.js – Fetch, Axios, Got & More | CurlToCode
description: Convert cURL to Node.js Fetch, Axios, Got, Ky, SuperAgent, or core HTTPS code locally, including file uploads, redirects, headers, auth, and bodies.
heading: Convert cURL to Node.js
eyebrow: Six server-side JavaScript clients
lede: Turn a cURL command into Node.js request code that can read local files and states each client's redirect, retry, and HTTP-error behaviour explicitly.
language: nodejs
client: fetch
languageLabel: Node.js
clientLabel: Fetch
order: 29
faqs:
  - question: Which Node.js HTTP client should I choose?
    answer: Use Fetch when a built-in standard API is enough, Axios for its familiar configuration and interceptors, Got or Ky for policy-rich wrappers, SuperAgent for its fluent upload API, and node:http or node:https when avoiding dependencies matters most.
  - question: How is this different from the JavaScript Fetch target?
    answer: The Node.js generators may read local paths with node:fs, so cURL file bodies and multipart file parts become working code. Browser output cannot honestly resolve a path such as /tmp/avatar.png and reports that limitation instead.
  - question: Why do the generated options disable retries or HTTP errors?
    answer: cURL sends one request and normally prints any HTTP response without treating a 404 or 500 as a transport error. Clients such as Got, Ky, and SuperAgent have different defaults, so the generated options neutralize those differences.
related:
  - curl-to-nodejs/fetch
  - curl-to-nodejs/axios
  - curl-to-nodejs/got
  - curl-to-nodejs/https
  - curl-to-javascript
---

## Choosing a Node.js client

Node now has a standards-based global Fetch API, so a dependency is no longer
required for ordinary requests. Axios remains useful when an application already
depends on its interceptors and response conventions. Got and Ky wrap modern
promise APIs with retry and error policies, while SuperAgent exposes a fluent
interface with mature multipart helpers.

The core `node:http` and `node:https` modules sit at the lowest level. They can
preserve repeated headers and stream file bodies without another package, but
they do not follow redirects. The generated code chooses the module from the URL
scheme; importing `node:https` for a plain HTTP URL would not work.

## Node can use local file paths

A shell command can name a file with `--data-binary @payload.bin` or
`-F 'photo=@avatar.png'`. In a browser, that path is not an object JavaScript may
open. Node has filesystem access, so these targets generate `openAsBlob`,
`createReadStream`, or `readFileSync` calls appropriate to the client.

That difference is why Node.js has its own language family instead of being an
alias for the browser JavaScript pages. The request model is shared, but the
runtime's capabilities are not.

## Defaults that affect correctness

Redirects, retries, and HTTP status handling can cause two visually similar
snippets to behave differently. Fetch follows redirects unless told to use
`redirect: "manual"`. Axios follows redirects in Node. Got and Ky retry some
requests and throw on HTTP error statuses by default; SuperAgent rejects its
promise on non-success responses.

The generators write these policies into the output so one cURL request remains
one request and a server's error response remains observable. When a client
cannot represent `-L`, as with the core modules, conversion stops with a precise
limitation rather than emitting code that ignores the option.

## Headers and authentication

Object-based header APIs cannot contain the same key twice. Fetch, Axios, Got,
Ky, and SuperAgent therefore reject meaningful duplicate header names instead
of silently replacing a value. The core module target groups repeated values
into arrays, which Node accepts as ordered header values.

Basic authentication uses a client's structured option when that preserves the
same request. Bearer tokens, cookies, and arbitrary headers remain explicit, and
all transformation stays in the browser without contacting the URL.
