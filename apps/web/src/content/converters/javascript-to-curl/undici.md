---
direction: code-to-curl
slug: javascript-to-curl/undici
parent: javascript-to-curl
title: Undici to cURL Converter | CurlToCode
description: Convert Node.js Undici request() calls to cURL locally using AST parsing, including flat header arrays, query options, bodies, and redirect handling.
heading: Convert Node.js Undici to cURL
eyebrow: Undici request parser
lede: Turn a static undici request() call and its options object into a readable cURL command without running the source or contacting the server it names.
language: javascript
client: undici
languageLabel: JavaScript
clientLabel: Undici
order: 113
faqs:
  - question: Which Undici call shapes can be converted?
    answer: The request export imported from undici and the undici.request namespace form are both recognized. The URL may be a string literal, a static template literal, a safe constant binding, or a new URL expression.
  - question: How are Undici's flat header arrays handled?
    answer: Undici accepts headers as a flat array of alternating names and values, which is how it preserves repeated header names. That form is read back with every duplicate intact, and a plain object of headers is also supported.
  - question: Why does Undici produce a cURL command without -L?
    answer: Undici does not follow redirects unless asked. A maxRedirections value above zero, or a dispatcher composing the redirect interceptor, maps to -L; otherwise the generated command keeps cURL's own no-redirect default.
related:
  - javascript-to-curl/fetch
  - javascript-to-curl
  - typescript-to-curl/undici
  - curl-to-javascript/undici
---

## Undici options the parser understands

The first argument supplies the URL. The optional options object can provide
`method`, `headers`, `body`, `query`, `maxRedirections`, and `dispatcher`.

Headers may be written as an object or as Undici's flat array of alternating
names and values. The array form is the one that can carry a repeated header
name, so it survives conversion with every entry preserved and ordered. A
`JSON.stringify` call with a statically known value becomes a JSON body, and a
plain string remains text unless its effective content type identifies another
representation.

## Query parameters and redirects

Undici accepts query parameters separately through `query` rather than requiring
them in the URL string. Both sources are merged into the generated cURL URL, with
parameters already present in the URL keeping their original position.

Redirect handling is where Undici differs most visibly from `fetch`. Undici does
not follow redirects by default, so a converted request only receives `-L` when
the source opts in through `maxRedirections` or through a dispatcher composing
`interceptors.redirect`.

## What cannot be resolved safely

The parser does not call helper functions, read environment variables, or execute
imports. `request(getUrl(), { headers: buildHeaders() })` therefore returns
separate dynamic URL and header issues rather than an invented command.

Options that carry connection policy rather than request content, such as
`bodyTimeout`, are reported as unsupported instead of being dropped silently. A
command that omitted them would misrepresent what the original code does.
