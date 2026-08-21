---
direction: code-to-curl
slug: nodejs-to-curl/ky
parent: nodejs-to-curl
title: Ky to cURL Command Converter | CurlToCode
description: Convert a Ky request into a cURL command, reading its fetch-shaped options including json, searchParams, and the redirect enum it inherits from fetch.
heading: Convert Ky to a cURL command
eyebrow: Ky parser
lede: Read a Ky call, which is fetch underneath, and recover the request including the options Ky adds on top.
language: nodejs
client: ky
languageLabel: Node.js
clientLabel: Ky
order: 1154
faqs:
  - question: Why does Ky share the fetch redirect values?
    answer: Ky calls fetch, so its redirect option is the same string enum. Manual becomes a command without -L, and follow or an absent option becomes one with it.
  - question: Does Ky add a content type to a string body?
    answer: Yes, by inheritance. fetch specifies text/plain with a UTF-8 charset for a string body with no declared type, and Ky does not change that.
  - question: What happens to the retry option?
    answer: It is read and dropped. Retrying resends the same request, so it does not change what the converted command should contain.
related:
  - nodejs-to-curl
  - nodejs-to-curl/got
  - curl-to-nodejs/ky
  - nodejs-to-curl/fetch
---

## fetch with a shorter grip

Ky's value is in its defaults, not in a different request model. That is why
this reader and the [fetch reader](/nodejs-to-curl/fetch) are the same code
with a different option list: `json` and `searchParams` are added, and
`retry` and `throwHttpErrors` are recognised and dropped.

## searchParams

Ky accepts a string, an object, or a `URLSearchParams` for the query. All
three are appended to the URL, so the converted command carries them where cURL
expects them rather than as a separate option.

## Bodies

Anything fetch accepts, plus Ky's `json` option, which serializes a value and
sets the JSON content type. A `FormData` assembled before the call is read
into multipart fields.
