---
direction: code-to-curl
slug: javascript-to-curl/jquery
parent: javascript-to-curl
title: jQuery Ajax to cURL Converter | CurlToCode
description: Convert a jQuery $.ajax call into a cURL command, reading its url, method, headers, data, and contentType settings statically without running the script.
heading: Convert jQuery Ajax to a cURL command
eyebrow: jQuery parser
lede: Read a $.ajax settings object and recover the request it describes, including the content type jQuery sets on your behalf.
language: javascript
client: jquery
languageLabel: JavaScript
clientLabel: jQuery
order: 114
faqs:
  - question: Which $.ajax settings are read?
    answer: url, method or type, headers, data, processData, and contentType. Settings that only decide response handling, such as dataType and the callbacks, are ignored.
  - question: What does contentType false mean in the output?
    answer: It tells jQuery not to set a content type, which is how a FormData body is sent. The converted command then carries no Content-Type header of its own.
  - question: Why does the command come out with -L?
    answer: jQuery is XMLHttpRequest underneath, and XMLHttpRequest follows a redirect with no way to decline. The command says so rather than implying the request would stop at the first response.
related:
  - javascript-to-curl
  - javascript-to-curl/xhr
  - curl-to-javascript/jquery
  - nodejs-to-curl
---

## Settings, not arguments

`$.ajax` takes one object, so the whole request is in one place. The reader
resolves that object statically: a settings value built by a function call is
reported as unresolved rather than guessed at.

`data` is read as the body when `processData` is false, which is how a
pre-serialized payload is sent. A `FormData` variable built with `append`
calls before the request is read as a multipart form.

## contentType is a header

jQuery's `contentType` sets the request's `Content-Type`. A string becomes
that header in the converted command; `false` means jQuery sets nothing, which
is what a `FormData` body needs so the browser can write its own boundary.

## Redirects are not optional

The generated command carries `-L`. That is not a preference: XMLHttpRequest
follows a 3xx itself and exposes no switch, so a jQuery request always follows.
Saying otherwise would describe a request the code cannot make.
