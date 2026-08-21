---
slug: curl-to-javascript/xhr
parent: curl-to-javascript
title: cURL to XMLHttpRequest Converter | CurlToCode
description: Convert cURL to dependency-free XMLHttpRequest code with methods, headers, exact bodies, FormData, authentication, and clear browser-only limitations.
heading: Convert cURL to XMLHttpRequest
eyebrow: Native legacy browser API
lede: Generate explicit XMLHttpRequest code for applications that cannot use Fetch, without hiding redirect, cookie, file-path, or duplicate-header constraints.
language: javascript
client: xhr
languageLabel: JavaScript
clientLabel: XMLHttpRequest
order: 25
faqs:
  - question: When should I use XMLHttpRequest instead of Fetch?
    answer: Use it when maintaining older browser code or when upload progress events are required by an existing implementation. Fetch is simpler for new promise-based request code and has a more portable API across modern runtimes.
  - question: Why can XMLHttpRequest not reproduce curl without -L?
    answer: Browsers handle redirects below the XMLHttpRequest API and do not expose a switch to stop following them. Both -L and its absence lead to browser-managed redirects, so the generated source documents the mismatch.
  - question: What happens to repeated request headers?
    answer: Calling setRequestHeader repeatedly comma-folds values instead of necessarily sending separate header fields. Because that can change semantics, CurlToCode reports the request rather than emitting a misleading conversion.
related:
  - curl-to-javascript
  - curl-to-javascript/jquery
  - curl-to-javascript/fetch
  - curl-to-http
---

## The explicit browser API

XMLHttpRequest makes every request step visible: construct the object, call
`open` with the method and URL, set headers, register a load handler, and send
the body. That verbosity is useful in older applications where request lifecycle
callbacks or upload progress are already built around XHR.

The output uses the original serialized JSON, text, and form bytes. Multipart
text fields go into `FormData`, which creates its own boundary and header.

## Redirects, cookies, and local files

Browser XHR always delegates redirect handling to the user agent. JavaScript
cannot express the difference between a default cURL request and one using
`-L`, so the output includes a comment instead of suggesting parity.

Likewise, scripts cannot set the `Cookie` header directly or turn a path such as
`/tmp/photo.png` into a browser `File`. A real file must come from an input or
another browser-authorized source. Conversion never attempts to read the path.

## Header fidelity

`setRequestHeader` appends a later value by comma-folding it with the earlier
one. That is not equivalent for every HTTP field and can be invalid for values
whose grammar does not permit a combined list. Duplicate names therefore return
an explicit limitation.

For browser code that does not need progress events, the
[Fetch target](/curl-to-javascript/fetch) is more compact. For exact repeated
headers or local files, choose a server-side target such as Node.js instead.
