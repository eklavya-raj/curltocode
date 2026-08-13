---
slug: curl-to-typescript/fetch
parent: curl-to-typescript
title: cURL to TypeScript Fetch Converter | CurlToCode
description: Convert cURL commands to typed TypeScript Fetch code with a satisfies RequestInit assertion, explicit redirect handling, headers, cookies, and auth.
heading: Convert cURL to TypeScript Fetch
eyebrow: Typed native fetch
lede: Generate Fetch calls that type-check against the DOM lib, using a satisfies assertion so a mistyped option fails at compile time rather than at runtime.
language: typescript
client: fetch
languageLabel: TypeScript
clientLabel: Fetch
order: 26
faqs:
  - question: Why does the generated code use satisfies rather than a type annotation?
    answer: A satisfies RequestInit assertion checks the object against the type while keeping the literal's own narrower types. An annotation would widen them, so you would lose the knowledge that method is exactly "POST" rather than a general string. It also means an unknown or misspelled key is a compile error instead of being silently ignored at runtime.
  - question: Do I need to install any types for this?
    answer: No. RequestInit comes from TypeScript's built-in DOM library, so it works in any project whose tsconfig includes "DOM" in lib. On Node 18 and later, add @types/node and the same code type-checks against the platform fetch.
  - question: Why is redirect set to manual in the output?
    answer: cURL does not follow redirects unless you pass -L, but fetch follows them by default. The generator writes redirect "manual" so the two behave the same. A command with -L omits the option and lets fetch follow, matching cURL again.
related:
  - curl-to-typescript
  - curl-to-javascript/fetch
  - curl-to-typescript/axios
---

## Typed without a wrapper

The output is ordinary `fetch`, with the init object checked against
`RequestInit` through a `satisfies` assertion. Nothing is imported and no
wrapper library is involved, so the snippet drops into a browser bundle, a Node
18+ service, Deno, or Bun unchanged.

`satisfies` is doing real work here. It validates every key against the type
while preserving the literal's narrower inference, so `method` stays the literal
`"POST"` rather than widening to `string`. A misspelled option such as
`redirects` fails the build instead of being quietly discarded at runtime, which
is the failure mode plain JavaScript gives you.

## Headers, cookies, and authentication

Headers are emitted as an object literal in the order cURL parsed them. Basic
credentials become an `Authorization` header with the base64 value already
computed, bearer tokens pass through as written, and `-b` cookies are folded
into a single `Cookie` header.

Two cautions apply in a browser rather than on a server. `Cookie` is a forbidden
header name that the browser will strip from a `fetch` call, and cross-origin
requests need the endpoint to send matching CORS headers. Neither affects Node,
Deno, or Bun, where the same code sends exactly what it says.

## Request bodies

JSON is emitted as `JSON.stringify` over the parsed object, so the payload stays
readable and reviewable rather than appearing as an opaque escaped string.
URL-encoded forms become the encoded string with the matching content type, and
inline binary data is preserved byte for byte.

## Current Fetch limitations

**A local file in a multipart upload is rejected.** `-F 'file=@avatar.png'` asks
cURL to read from disk, which browser JavaScript cannot do without user
interaction. The converter reports this rather than emitting code that silently
uploads nothing. Take the `File` object from an `<input type="file">` and append
it to a `FormData` yourself, or use the [Undici
target](/curl-to-typescript/undici) if you are on Node and want the file read
for you.

**Duplicate header names collapse.** An object literal cannot hold the same key
twice. When your command repeats a header, use `new Headers()` with `append`,
which the [Undici target](/curl-to-typescript/undici) already does through its
flat header array.
