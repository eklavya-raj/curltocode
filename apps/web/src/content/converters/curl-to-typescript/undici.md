---
slug: curl-to-typescript/undici
parent: curl-to-typescript
title: cURL to TypeScript Undici Converter | CurlToCode
description: Convert cURL commands to TypeScript Undici code for Node, preserving repeated headers through a flat header array and reading local multipart files.
heading: Convert cURL to TypeScript Undici
eyebrow: Node HTTP client
lede: Generate Undici requests for Node services, the one JavaScript target that keeps duplicate header names intact and can read a local file for a multipart upload.
language: typescript
client: undici
languageLabel: TypeScript
clientLabel: Undici
order: 28
faqs:
  - question: Why does Undici keep duplicate headers when Fetch and Axios cannot?
    answer: Undici accepts headers as a flat array of alternating names and values rather than an object. An object cannot hold the same key twice, so a repeated header silently loses all but the last value. The array has no such constraint, which makes this the right target whenever your command repeats a header.
  - question: Is Undici different from the global fetch in Node?
    answer: Node's global fetch is built on Undici, so they share an implementation. The request API used here is Undici's own lower-level interface, which returns a destructurable object with statusCode and a body stream, and exposes connection and dispatcher controls that the fetch wrapper hides.
  - question: Can I run this in a browser?
    answer: No. Undici is a Node library that depends on Node's networking internals, so it will not bundle for the browser. Use the Fetch target for browser code; it produces the same request through the platform API.
related:
  - curl-to-typescript
  - curl-to-javascript/undici
  - curl-to-typescript/fetch
---

## The target that preserves repeated headers

Undici takes headers as a flat array of alternating names and values rather than
an object literal. That single difference makes it the most faithful JavaScript
target CurlToCode has, because an object cannot hold the same key twice.

If your command repeats a header — several `Set-Cookie` values, a stacked
`Accept`, a vendor header carrying multiple tokens — Fetch and Axios lose every
value but the last. Undici keeps all of them, in order. When a command repeats a
header, this is the target to pick.

## The request API

The output destructures `{ statusCode, body }` from `request()`. This is
Undici's own lower-level interface rather than the `fetch` wrapper built on top
of it, so the status code is a plain number and the body is a stream you consume
explicitly, typically with `await body.text()`.

Node's global `fetch` is implemented on Undici, so the two share the underlying
machinery. Reaching for `request` directly gets you the flat header array,
dispatcher control, and connection pooling configuration that the `fetch`
surface deliberately hides.

## Bodies and multipart uploads

JSON, URL-encoded forms, and inline binary data are passed as the original
bytes. Unlike the browser targets, Undici can read from disk, so
`-F 'file=@avatar.png'` produces a real upload using Undici's `FormData` with
the file read for you — no `<input type="file">` and no manual stream plumbing.

## Things to know

**This is Node-only.** Undici depends on Node's networking internals and will
not bundle for a browser. Use the [Fetch target](/curl-to-typescript/fetch) for
browser code.

**Redirects are not followed by default,** which already matches cURL. A command
with `-L` adds Undici's redirect interceptor rather than leaving the behaviour
implicit.

**The body must be consumed.** Undici streams responses, and leaving a body
unread holds the connection open. The generated snippet always reads it, which
is worth preserving when you adapt the code.

Install the dependency with `npm install undici`. Node 18 and later ship Undici
internally for `fetch`, but the `request` API needs the package installed
directly.
