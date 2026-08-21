---
direction: code-to-curl
slug: nodejs-to-curl
title: Node.js to cURL – Fetch, Axios, Got & More | CurlToCode
description: Convert Node.js HTTP code to a cURL command. Reads Fetch, Axios, Got, Ky, SuperAgent, and node:https statically, including file bodies and duplicate headers.
heading: Convert Node.js to cURL
eyebrow: Node.js HTTP parser
lede: Turn a Node.js request into the cURL command it stands for, whichever of the six supported clients wrote it, without running the script.
language: nodejs
client: fetch
languageLabel: Node.js
clientLabel: Fetch
order: 115
faqs:
  - question: Which Node.js clients can be read back?
    answer: The global fetch, Axios, Got, Ky, SuperAgent, and the core node:https and node:http modules. Each is recognised by its own call shape rather than by the import alone.
  - question: Is the script executed to work out the request?
    answer: No. Every reader walks the syntax tree. A value that only exists at run time is reported as an unresolved expression instead of being guessed at or evaluated.
  - question: Why does Node.js have its own pages rather than sharing the JavaScript ones?
    answer: Node code can read files from disk, so a request body or an upload may name a path that browser JavaScript could never resolve. The clients differ too.
related:
  - nodejs-to-curl/fetch
  - nodejs-to-curl/axios
  - nodejs-to-curl/got
  - curl-to-nodejs
  - javascript-to-curl
---

## Six clients, one request model

Node.js has no single HTTP client, and a real codebase usually contains
whichever one was current when the file was written. All six supported readers
produce the same normalized request — method, URL, query, headers, cookies,
authentication, body, and redirect policy — so the cURL command you get does
not depend on which library the original author reached for.

## What each client contributes

**[fetch](/nodejs-to-curl/fetch)** and **[Ky](/nodejs-to-curl/ky)** share the
options-object shape and the `redirect` enum, because Ky calls fetch.

**[Got](/nodejs-to-curl/got)** uses the same shape with its own names:
`followRedirect` instead of `redirect`, plus `json`, `form`, and
`searchParams` options that are read into the body and the query.

**[Axios](/nodejs-to-curl/axios)** carries its configuration in one object and
counts redirects rather than switching them.

**[SuperAgent](/nodejs-to-curl/superagent)** is a chain, so the request is
assembled from its steps.

**[node:https](/nodejs-to-curl/https)** is the module underneath all of them,
and the only one that can send the same header name twice.

## Static, and local

Nothing is executed and nothing is uploaded. The parsing happens in your
browser, which is also why an expression the reader cannot resolve is reported
rather than filled in with a plausible-looking value.
