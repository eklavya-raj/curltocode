---
direction: code-to-curl
slug: javascript-to-curl/xhr
parent: javascript-to-curl
title: XMLHttpRequest to cURL Converter | CurlToCode
description: Convert an XMLHttpRequest into a cURL command by reading open, setRequestHeader, and send statically, including credentials passed to open and a FormData body.
heading: Convert XMLHttpRequest to a cURL command
eyebrow: XMLHttpRequest parser
lede: Follow an XMLHttpRequest through open, its headers, and send, and recover the request without executing a line of it.
language: javascript
client: xhr
languageLabel: JavaScript
clientLabel: XMLHttpRequest
order: 115
faqs:
  - question: Which calls does the reader follow?
    answer: open, setRequestHeader, and send. Those are the whole request surface of an XMLHttpRequest; every other member reads a response or attaches an event handler.
  - question: Are the credentials in open picked up?
    answer: Yes. open takes an optional user and password as its fourth and fifth arguments, and those become basic authentication in the converted command.
  - question: What happens if the object is never sent?
    answer: The conversion stops and says so. An XMLHttpRequest that is opened and configured but never sent does not describe a request that would reach a server.
related:
  - javascript-to-curl
  - javascript-to-curl/jquery
  - curl-to-javascript/xhr
  - http-to-curl
---

## A small, closed API

An XMLHttpRequest is configured by exactly three calls. `open` fixes the
method and the URL, `setRequestHeader` adds one field at a time, and `send`
supplies the body. Nothing else on the object can change what goes on the wire,
which is why event handlers and response properties are passed over instead of
being reported as unsupported.

## Bodies

`send` takes a string, a `URLSearchParams`, a `Blob`, or a `FormData`.
Each is read into the same normalized body the rest of the site uses, so a form
built with `append` before the send comes back as multipart fields rather than
as an opaque value.

A value declared just above the `send` resolves, because the reader anchors
its bindings at the send rather than at the constructor.

## Redirects

The command carries `-L`, because XMLHttpRequest follows redirects and cannot
be told not to. See [jQuery](/javascript-to-curl/jquery), which is the same
engine with a different surface.
