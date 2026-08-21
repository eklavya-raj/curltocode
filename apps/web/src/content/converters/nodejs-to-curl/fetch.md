---
direction: code-to-curl
slug: nodejs-to-curl/fetch
parent: nodejs-to-curl
title: Node.js Fetch to cURL Converter | CurlToCode
description: Convert a Node.js fetch call into a cURL command, reading its method, headers, body, and redirect option statically, including file bodies opened from disk.
heading: Convert Node.js fetch to a cURL command
eyebrow: Node fetch parser
lede: Read the global fetch as Node runs it, where a body may come from the file system rather than from a form element.
language: nodejs
client: fetch
languageLabel: Node.js
clientLabel: Fetch
order: 1151
faqs:
  - question: How is this different from browser fetch?
    answer: The call shape is identical; the difference is what a body may be. Node can open a file, so a request that browser JavaScript has to refuse converts cleanly here.
  - question: What does redirect manual become?
    answer: A command without -L. cURL stops at the first response by default, which is exactly what redirect set to manual asks fetch to do.
  - question: Is a string body given a content type?
    answer: Yes. The Fetch standard specifies text/plain with a UTF-8 charset for a string body that declares no type, so the converted command carries that header.
related:
  - nodejs-to-curl
  - nodejs-to-curl/ky
  - curl-to-nodejs/fetch
  - javascript-to-curl/fetch
---

## The same call, a wider world

Node's global `fetch` takes the same `(url, init)` pair the browser does, so
the reader is the same one. What changes is the range of values a body can
hold: `openAsBlob` and a read stream both name a file on disk, which a browser
page has no way to produce.

## Options that are read

`method`, `headers`, `body`, and `redirect`. An option outside that set is
reported rather than ignored, because an unrecognised option may well change
what is sent.

Headers are accepted as an object, an array of pairs, or a `Headers` instance.
The array form is the one that preserves a repeated field name.

## Bodies

A string, `URLSearchParams`, `JSON.stringify(...)`, a `TextEncoder` result,
and a `FormData` built with `append` calls all resolve. Anything assembled at
run time is reported as an unresolved expression, with the source text quoted
back so you can see what stopped it.
