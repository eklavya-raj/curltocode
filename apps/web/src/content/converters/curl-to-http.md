---
direction: curl-to-code
slug: curl-to-http
title: cURL to Raw HTTP Request Converter | CurlToCode
description: Convert a cURL command into the raw HTTP/1.1 request message it sends, with the request line, Host, headers, and body exactly as they go on the wire.
heading: Convert cURL to a raw HTTP request
eyebrow: HTTP/1.1 message
lede: See the actual request a cURL command produces — request line, Host, headers, and body — instead of code that would produce it.
language: http
client: raw
languageLabel: HTTP
clientLabel: Raw request
order: 90
faqs:
  - question: What is a raw HTTP request?
    answer: It is the text a client writes to the socket — a request line naming the method and path, a block of header lines, a blank line, and then the body. Every HTTP library in every language ultimately produces this, which is why it is useful for debugging what a request really contains.
  - question: Why does the path appear on the request line instead of the full URL?
    answer: This is origin-form, what a client sends to a server directly. The scheme and host move to the Host header, and the request line keeps only the path and query. Absolute-form, with the whole URL on the request line, is used when talking to a proxy.
  - question: Does the output use CRLF line endings like the real protocol?
    answer: The rendered message uses LF, because a carriage return survives neither a browser textarea nor a Markdown code block intact. RFC 9112 specifies CRLF on the wire. Content-Length counts only the body, which is unaffected, so the message stays internally consistent.
  - question: Why can a file upload not be shown as a raw request?
    answer: A raw message has to contain the bytes it sends, and the contents of a local file are not known to a converter that never reads your disk. Rather than emit a placeholder that would not match what cURL sends, the conversion is refused.
related:
  - http-to-curl
  - curl-to-python
  - curl-to-javascript
  - curl-to-go
---

## What the request line carries

The first line names three things: the method, the request target, and the
protocol version. The target is the path and query only — `/v1/users?page=2`
rather than the whole URL — because the authority has already been established
by the connection. That is why a `Host` header always follows: it is how a
server hosting many sites knows which one you meant.

A request with query parameters keeps them in the order cURL parsed them,
including repeated names, because the target is copied from the URL rather than
rebuilt from a map.

## Headers you did not write

A cURL command usually implies more headers than it states. `-u` becomes an
`Authorization: Basic` line with the credentials base64-encoded. `-b` becomes a
single `Cookie` header joining the pairs with `; `. A `-d` body implies
`Content-Type: application/x-www-form-urlencoded` unless you set one yourself.
All of them appear here explicitly, which is the point: the message shows what
is actually sent, not what was typed.

`Content-Length` is counted in bytes rather than characters, so a body
containing emoji or accented text reports the length a server will read.

## Multipart bodies and their boundary

A multipart body is not a single value but a sequence of parts separated by a
boundary string, which the client chooses. Selecting this target shows the
assembled body: each part introduced by the boundary, its `Content-Disposition`
naming the field, a blank line, and the value.

Because the boundary is chosen per message, converting the same command twice in
a different tool will produce different delimiters while meaning the same thing.

## What a message cannot say

Two things travel with a request without being part of it.

The first is the scheme. TLS is a property of the connection, not of the text
sent over it, so nothing in a request message distinguishes HTTPS from plain
HTTP. The second is redirect policy: whether a 3xx is followed is decided by the
client after the response arrives, so `-L` has nowhere to appear and is not
represented here.

Everything else — method, target, query, headers, cookies, credentials, and the
body's exact bytes — is carried in full.
