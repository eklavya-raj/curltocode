---
direction: code-to-curl
slug: nodejs-to-curl/got
parent: nodejs-to-curl
title: Got to cURL Command Converter | CurlToCode
description: Convert a Got request to a cURL command, reading its options object including json, form, searchParams, and followRedirect, plus the per-verb shortcuts.
heading: Convert Got to a cURL command
eyebrow: Got parser
lede: Read a Got call and recover the request behind it, including the options Got serializes for you.
language: nodejs
client: got
languageLabel: Node.js
clientLabel: Got
order: 1153
faqs:
  - question: Which Got options change the request?
    answer: method, headers, body, json, form, searchParams, and followRedirect. retry, throwHttpErrors, and timeout decide what happens around the exchange, so they are read and discarded.
  - question: What does the json option produce?
    answer: A JSON body plus the application/json content type Got sets with it, so the converted command sends the same bytes and the same header.
  - question: Does an absent followRedirect mean the request stops at a 3xx?
    answer: No. Got follows redirects by default, so a request that says nothing about them converts to a command with -L.
related:
  - nodejs-to-curl
  - nodejs-to-curl/ky
  - curl-to-nodejs/got
  - nodejs-to-curl/fetch
---

## An options object with its own vocabulary

Got takes the same `(url, options)` shape as fetch and renames almost every
option. `followRedirect` is a boolean rather than a string enum, and `json`
and `form` ask Got to serialize a value rather than to send one.

Both serializing options set a content type as a side effect, so the reader
records that header alongside the body. Otherwise the converted command would
send the right bytes with no declaration of what they are.

## Shortcuts

`got.post(url, options)` and its siblings supply the method through the
function name. The options object is read the same way, and an explicit
`method` inside it still wins.

## What is deliberately ignored

`retry` and `throwHttpErrors` are prominent in Got code and change nothing
about the request. They are recognised so they do not stop the conversion, and
then dropped, because cURL has no equivalent and needs none.
