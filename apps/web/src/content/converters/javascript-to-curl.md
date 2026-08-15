---
direction: code-to-curl
slug: javascript-to-curl
title: JavaScript to cURL – Fetch & Axios Converter | CurlToCode
description: Convert static JavaScript Fetch or Axios requests to readable cURL commands locally, with headers, JSON, forms, authentication, cookies, and redirects.
heading: Convert JavaScript to cURL
eyebrow: JavaScript request parser
lede: Parse Fetch or Axios source into a normalized HTTP request, then generate a conventional cURL command without executing or uploading your code.
language: javascript
client: fetch
languageLabel: JavaScript
clientLabel: Fetch
order: 110
faqs:
  - question: Does the converter execute the JavaScript I paste?
    answer: No. It parses source code into an abstract syntax tree and reads supported static values. It never evaluates the program, imports its modules, calls the represented URL, or sends the source to a server.
  - question: Can it convert both Fetch and Axios requests?
    answer: Yes. Choose JavaScript and then Fetch or Axios in the converter. Auto-detect is also available when you are unsure which client a pasted snippet uses.
  - question: What happens when a URL or header value is dynamic?
    answer: The converter preserves details it can prove statically and reports the unresolved expression. It does not invent the runtime result of a function call, mutable variable, or computed object.
related:
  - javascript-to-curl/fetch
  - javascript-to-curl/axios
  - javascript-to-curl/undici
  - typescript-to-curl
  - curl-to-javascript
  - go-to-curl
---

## Static analysis instead of execution

CurlToCode reads JavaScript with an AST parser. Literal strings, object and array
literals, safe constant bindings, static template literals, and supported request
constructors can be recovered without running the program. That distinction is
important because pasted networking code may contain credentials or side effects.

The recovered values enter the same normalized request model used by the forward
converters. The cURL generator therefore handles shell quoting, repeated query
parameters, request methods, and body types in one place rather than relying on a
JavaScript-specific string replacement.

## Choosing Fetch or Axios

Use the Language menu to select JavaScript, then choose Fetch or Axios from the
Library menu. Fetch parsing understands its URL and `RequestInit` object. Axios
parsing understands configuration-object calls and method helpers such as
`axios.post(url, data, config)`.

Auto-detect remains useful for an isolated snippet. An explicit library is better
when a short or aliased call could otherwise be ambiguous, and it also prevents an
Axios snippet from being silently treated as Fetch.

## Dynamic expressions and safe limits

Calls such as `fetch(getApiUrl())` cannot be converted completely without running
application code. The converter reports `getApiUrl()` as a dynamic URL. The same
rule applies to computed headers and request bodies. Static values alongside a
dynamic expression remain visible in the structured limitation so you can decide
whether to replace the missing value manually.

Unsupported request options are also reported. Silently dropping an option such
as credentials or an Axios transform could produce a cURL command with different
behavior, so CurlToCode rejects that conversion instead.
