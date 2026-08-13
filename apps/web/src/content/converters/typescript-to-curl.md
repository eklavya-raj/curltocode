---
direction: code-to-curl
slug: typescript-to-curl
title: TypeScript to cURL – Fetch & Axios Converter | CurlToCode
description: Convert static TypeScript Fetch or Axios requests to cURL in your browser, with AST-aware handling of annotations, satisfies expressions, and request data.
heading: Convert TypeScript to cURL
eyebrow: TypeScript request parser
lede: Parse typed Fetch and Axios source into cURL while understanding TypeScript syntax and refusing runtime-only expressions that cannot be resolved safely.
language: typescript
client: fetch
languageLabel: TypeScript
clientLabel: Fetch
order: 120
faqs:
  - question: Does TypeScript need to be compiled before conversion?
    answer: No. The parser accepts TypeScript syntax directly, including type annotations and supported satisfies or assertion wrappers around static request values.
  - question: Are TypeScript types used to invent runtime values?
    answer: No. Types do not prove the runtime contents of a variable. The converter only uses statically represented values and reports expressions that require execution.
  - question: Can both typed Fetch and Axios code be converted?
    answer: Yes. Select TypeScript, then choose Fetch or Axios. Each library is checked explicitly so a mismatch is reported rather than parsed as the wrong request client.
related:
  - typescript-to-curl/fetch
  - typescript-to-curl/axios
  - javascript-to-curl
  - curl-to-typescript
---

## Type-aware syntax, value-based conversion

TypeScript adds syntax around JavaScript values, but a cURL command must describe
runtime request bytes. CurlToCode parses the TypeScript AST and unwraps supported
annotations, assertions, and `satisfies` expressions without treating a type as
a concrete value.

For example, a static options object that satisfies `RequestInit` can be read.
A variable declared only as `const headers: HeadersInit = getHeaders()` remains
dynamic because its type cannot reveal what the function returns.

## Fetch and Axios targets

After choosing TypeScript, the Library menu offers Fetch and Axios. The target
selection constrains the parser and gives a clear mismatch if the pasted call
uses the other client. Static URLs, headers, query parameters, methods, JSON,
forms, authentication, and redirect behavior flow into the shared HTTP model.

Generated cURL uses Unix-style shell quoting and conventional multiline flags.
It does not execute imports or contact the represented URL.

## Useful preparation before converting

Keep the request expression and any static constants it references in the pasted
snippet. Constants in the same safe lexical scope can often be resolved, while a
symbol imported from application configuration cannot.

If the tool reports a dynamic expression, replace only that expression with the
known runtime value. This preserves the rest of the request and makes the manual
assumption visible instead of hiding it inside generated output.
