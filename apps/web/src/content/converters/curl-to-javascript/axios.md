---
slug: curl-to-javascript/axios
parent: curl-to-javascript
title: cURL to Axios Converter – JavaScript | CurlToCode
description: Convert cURL commands to Axios request code in your browser, using the native auth option, maxRedirects, and a config object that mirrors your command.
heading: Convert cURL to Axios
eyebrow: Axios HTTP client
lede: Generate an Axios config object that uses the library's own facilities for authentication and redirects instead of hand-built headers.
language: javascript
client: axios
languageLabel: JavaScript
clientLabel: Axios
order: 22
faqs:
  - question: Why does basic auth become an auth object instead of a header?
    answer: Axios has a native auth option that takes a username and password and performs the base64 encoding itself. Using it is less error-prone than building the Authorization header by hand, so the converter emits that instead and leaves no Authorization header in the output.
  - question: How are redirects controlled in Axios?
    answer: Through maxRedirects. Axios follows up to five redirects by default, so when your command lacked -L the generated config sets maxRedirects to 0. Note that in the browser build this option has no effect, because the underlying XMLHttpRequest handles redirects itself.
  - question: Does Axios throw on error status codes?
    answer: Yes, and this is its most useful difference from fetch. Any response outside the 2xx range rejects the promise with an error carrying the response, so you do not have to check a success flag manually.
related:
  - curl-to-javascript/fetch
  - curl-to-javascript
  - curl-to-typescript
---

## Axios-specific output

The generated code calls `axios` with a single configuration object rather than
one of the method shortcuts. The object form keeps the URL, method, headers, and
body visible together and works uniformly for every verb.

The method is lowercased because that is the convention Axios uses in its own
documentation and type definitions, though it accepts either case.

## Bodies and dependencies

Request bodies go into `data`. A JSON body is emitted as `JSON.stringify` over an
object literal when the bytes round-trip exactly, and as a raw string otherwise,
so unusual formatting is not silently normalized.

Unlike Fetch, Axios is a dependency. The converter reports the install command
separately from the generated source, so you can copy the code without dragging a
shell command into your editor.

## Common conversion issues

**`maxRedirects` does nothing in the browser.** It is a Node.js-only option. In a
browser bundle, `XMLHttpRequest` follows redirects transparently and there is no
way to intercept them.

**Axios sets `Content-Type` automatically for plain objects.** The generated code
passes bodies as strings with an explicit header so the media type from your
command is what actually gets sent.

**Duplicate header names are rejected.** Axios normalizes headers into a single
object, so repeated names cannot survive. The converter reports that rather than
quietly dropping one.
