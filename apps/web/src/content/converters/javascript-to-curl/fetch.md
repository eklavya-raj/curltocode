---
direction: code-to-curl
slug: javascript-to-curl/fetch
parent: javascript-to-curl
title: JavaScript Fetch to cURL Converter | CurlToCode
description: Convert JavaScript fetch() calls to cURL locally using AST parsing, including methods, headers, JSON, URLSearchParams, FormData, and redirect behavior.
heading: Convert JavaScript Fetch to cURL
eyebrow: Fetch API parser
lede: Turn a static fetch() call and its RequestInit options into a readable cURL command without evaluating the source or making a network request.
language: javascript
client: fetch
languageLabel: JavaScript
clientLabel: Fetch
order: 111
faqs:
  - question: Which fetch URL forms can be converted?
    answer: String literals, static template literals, safe constant bindings, and supported string concatenation can be resolved. Function calls and mutable runtime values are reported as dynamic.
  - question: How are JSON.stringify bodies converted?
    answer: A statically known object passed to JSON.stringify becomes a JSON request body. Its content type and serialized bytes are represented explicitly in the generated cURL command.
  - question: Does redirect manual become a cURL flag?
    answer: Manual redirect behavior is cURL's default, while redirect follow maps to the conventional -L flag. The normalized model accounts for the different defaults of the two clients.
related:
  - javascript-to-curl/axios
  - javascript-to-curl
  - typescript-to-curl/fetch
  - curl-to-javascript/fetch
---

## Fetch arguments the parser understands

The first `fetch` argument supplies the URL. The optional `RequestInit` object can
provide `method`, `headers`, `body`, and `redirect`. Headers may be an object, an
array of pairs, or a statically populated `Headers` instance. An array or
`Headers` form can preserve repeated header names that a plain object cannot.

`JSON.stringify` with a static value becomes a JSON body. A string remains text
unless its effective content type identifies another representation.
`URLSearchParams` is treated as URL-encoded form data, and a safely constructed
`FormData` value becomes multipart data.

## URL parameters and request methods

Query parameters embedded in the URL remain part of the generated URL, including
duplicate names and their order. An omitted method is interpreted as GET unless a
body implies the Fetch default POST behavior represented by the source.

The cURL generator writes a method flag when it is semantically useful. Redirect
following becomes `-L`; manual redirects require no extra cURL option because
that is already cURL's default behavior.

## What cannot be resolved safely

The parser does not call helper functions, read environment variables, or execute
imports. `fetch(apiUrl, { headers: makeHeaders() })` therefore returns separate
dynamic URL or header issues. It can still preserve a literal method or body from
the same call.

Browser-managed state is not fabricated either. A credentials mode does not
contain the browser's cookies, so it cannot become a concrete `Cookie` header.
Add known cookie values explicitly if the cURL command must include them.
