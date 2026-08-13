---
direction: code-to-curl
slug: typescript-to-curl/fetch
parent: typescript-to-curl
title: TypeScript Fetch to cURL Converter | CurlToCode
description: Convert typed fetch() requests to cURL locally, including RequestInit objects, Headers, URLSearchParams, JSON bodies, methods, and redirect settings.
heading: Convert TypeScript Fetch to cURL
eyebrow: Typed Fetch parser
lede: Convert TypeScript fetch() calls and static RequestInit values to readable cURL without compiling or executing the pasted source.
language: typescript
client: fetch
languageLabel: TypeScript
clientLabel: Fetch
order: 121
faqs:
  - question: Can the parser read a RequestInit satisfies expression?
    answer: Yes. Supported TypeScript wrappers around a static object are unwrapped before request properties are read, while their types are never used as substitutes for missing runtime values.
  - question: Are Headers and URLSearchParams constructors supported?
    answer: Static constructor values and safely populated instances are recognized, allowing repeated headers and encoded form pairs to reach the normalized request model.
  - question: Why is a typed function result still dynamic?
    answer: A return type describes allowed values but does not reveal the value returned at runtime. Evaluating the function would be unsafe, so the expression is reported explicitly.
related:
  - typescript-to-curl/axios
  - typescript-to-curl
  - javascript-to-curl/fetch
  - curl-to-typescript/fetch
---

## RequestInit and TypeScript syntax

A typed options object can include the same request fields as JavaScript Fetch:
method, headers, body, and redirect behavior. The parser handles supported type
annotations and `satisfies RequestInit` syntax around static values, then sends
only their runtime meaning into the normalized request model.

This means `as const` does not change the generated request, and a declared
interface cannot fill in an omitted URL or header. Values must still be present
in the source.

## Structured bodies and headers

Static `JSON.stringify` input becomes JSON. `URLSearchParams` becomes
application/x-www-form-urlencoded data, and supported `FormData` construction
becomes multipart. Headers can be represented as a record, pair list, or
`Headers` instance; pair-based forms retain repeated names.

The cURL generator escapes each recovered value for a Unix-compatible shell. It
adds the method, headers, body flags, and redirect option needed to preserve the
request rather than mirroring TypeScript syntax mechanically.

## Generics do not make data static

Generic helpers, imported configuration, and function calls remain runtime
expressions even when their types are precise. The converter reports their source
expression and retains any independently static parts of the Fetch call. It never
transpiles and runs the program to discover a value.
