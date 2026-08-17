---
direction: code-to-curl
slug: http-to-curl
title: Raw HTTP Request to cURL Converter | CurlToCode
description: Paste a raw HTTP/1.1 request message and get the cURL command that reproduces it, with the URL rebuilt from the Host header and headers, cookies, and body preserved.
heading: Convert a raw HTTP request to cURL
eyebrow: HTTP/1.1 parser
lede: Turn a captured request message — from a proxy log, a browser devtools copy, or an RFC example — back into a cURL command you can run.
language: http
client: raw
languageLabel: HTTP
clientLabel: Raw request
order: 200
faqs:
  - question: Where does the URL come from if the request line has no host?
    answer: It is rebuilt from the Host header and the request target. A request line in absolute-form already carries the whole URL and is used as-is, which is the form sent to a proxy.
  - question: How is HTTPS decided when the message does not say?
    answer: TLS is a property of the connection rather than the message, so it is inferred. An explicit port 443 or an X-Forwarded-Proto header settles it outright. Otherwise a loopback or explicitly-ported host reads as plain HTTP, and any other host reads as HTTPS.
  - question: Are CRLF line endings required?
    answer: No. The protocol specifies CRLF, and a message copied from a capture will usually have it, but LF is accepted too so that a request retyped or pasted from a document still parses.
  - question: What happens to Content-Length?
    answer: It is dropped. It describes how this particular message was framed, and the cURL command that comes out is framed by cURL itself, which counts the body again.
related:
  - curl-to-http
  - python-to-curl
  - javascript-to-curl
  - go-to-curl
---

## Reading a captured request

Paste the message as you copied it. The first line is expected to be a request
line — a method, a target, and an HTTP version — and everything up to the first
blank line is read as headers. What follows the blank line is the body.

This is the one source format here that is not a programming language, so
nothing is being analysed statically or resolved from a variable. The message
already is the request; it only has to be read.

## Headers that become something else

Three headers do not stay headers. `Cookie` is split back into individual pairs,
so the generated command uses `-b` rather than a hand-written header.
`Authorization` becomes `-u` when it carries base64 basic credentials, decoded
back to a username and password, and stays a bearer header otherwise.
`Content-Length` is dropped, because cURL computes it for the body it is given.

An obsolete folded header — a value continued on an indented following line —
is joined back together rather than being mistaken for a separate field.

## Multipart bodies

When the content type declares a boundary, the body is split on it and each
part's `Content-Disposition` supplies the field name. The result is a set of
`-F` flags. The boundary itself is not carried across: it belongs to the message
you pasted, and cURL picks its own when it sends.

## What the message does not tell you

A request message says nothing about whether the client would follow a redirect,
so the generated command does not add `-L`. Add it yourself if the original
client followed redirects; nothing in the captured text could have revealed
that either way.
