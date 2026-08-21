---
slug: curl-to-lua
title: cURL to LuaSocket HTTP Converter | CurlToCode
description: Convert cURL to LuaSocket or LuaSec request code with methods, headers, exact bodies, authentication, redirects, multipart bytes, cookies, and files.
heading: Convert cURL to Lua
eyebrow: LuaSocket and LuaSec HTTP
lede: Generate a source, sink, and request table for Lua's established HTTP stack, selecting HTTPS support from the URL scheme.
language: lua
client: http
languageLabel: Lua
clientLabel: LuaSocket HTTP
order: 98
faqs:
  - question: Why can HTTPS require a different Lua module?
    answer: LuaSocket provides plain HTTP, while LuaSec supplies the HTTPS transport. The generated import and dependency guidance reflect the URL scheme rather than treating TLS as interchangeable.
  - question: Can LuaSocket preserve duplicate headers?
    answer: Its request table stores headers by key, so separate values under the same name cannot survive. The converter reports that conflict.
  - question: How is multipart encoded without a helper?
    answer: The generator assembles the boundary, part headers, field text, and file bytes into an ltn12 source, then sets the exact matching Content-Type.
related:
  - curl-to-perl
  - curl-to-c
  - curl-to-crystal
  - curl-to-nim
---

## Lua's streaming request table

The generated source builds an LTN12 body source and response sink around a
LuaSocket-style request table. It sets the URL, exact method, headers, redirect
boolean, source, and content length before invoking the HTTP module.

HTTPS URLs use LuaSec's HTTPS module because LuaSocket alone cannot negotiate
TLS. The dependency metadata changes accordingly.

## Bodies and multipart data

Serialized bodies remain strings. File-backed content is read by the generated
Lua program. Multipart input is encoded explicitly because the client has no
native form builder; the boundary used in the bytes is also set in the header.

The header table cannot hold repeated names. CurlToCode stops on that request
rather than allowing a later assignment to overwrite the first value.

The result reports the LuaSocket or LuaSec package needed for the selected URL.
