---
slug: curl-to-typescript
title: cURL to TypeScript Converter – Typed Fetch | CurlToCode
description: Convert cURL commands to TypeScript Fetch or Axios with typed request configuration, local processing, and explicit handling of unsupported dynamic code.
heading: Convert cURL to TypeScript
eyebrow: Typed HTTP request code
lede: Generate Fetch or Axios source that keeps request configuration type-checked without adding unsafe assertions or widening useful literal types.
language: typescript
client: fetch
languageLabel: TypeScript
clientLabel: Fetch
order: 25
faqs:
  - question: Why does the output use satisfies instead of a type annotation?
    answer: A satisfies RequestInit clause checks the object against the type while keeping its literal types intact. Annotating the variable as RequestInit instead would widen "POST" to string, losing information that later code might depend on.
  - question: Does the generated TypeScript need any type packages?
    answer: Fetch output needs none, since RequestInit is part of the DOM and Node lib definitions. Axios output imports AxiosRequestConfig as a type from axios itself, so there is no separate @types package to install.
  - question: Can the reverse direction read TypeScript syntax?
    answer: Yes. The reverse parser understands TypeScript-specific wrappers such as satisfies and as around static request expressions. It parses only; it never evaluates code, calls functions, or resolves imported runtime values.
related:
  - curl-to-javascript
  - curl-to-python
  - curl-to-rust
---

## Type-checked request configuration

TypeScript Fetch output uses `satisfies RequestInit`, which validates the shape
without widening literal values. Axios output imports `AxiosRequestConfig` as a
type and checks the configuration object the same way.

Neither form introduces an `as` assertion. Assertions would silence real errors,
which defeats the point of generating typed code in the first place.

## AST-based reverse conversion

Switching to code-to-cURL parses your source into an abstract syntax tree and
reads request details out of it statically. Local `const` bindings, template
literals without expressions, `URLSearchParams`, and object literals all resolve.

Nothing is executed. The parser never calls a function, never imports a module,
and never evaluates an expression, which is what makes it safe to paste a request
containing real credentials.

## When a value is dynamic

Runtime expressions cannot be converted truthfully without execution. When the
parser meets one, it reports the unresolved URL, method, headers, body, or
configuration expression and keeps every static detail it could identify, rather
than discarding the whole request or inventing a value.

## Common conversion issues

**`satisfies` requires TypeScript 4.9 or newer.** On an older compiler, remove
the clause or upgrade; there is no equivalent that preserves literal types.

**Type checking does not validate the request at runtime.** `RequestInit` will
happily accept a header value that your server rejects. The generated types
protect the shape of the call, not the semantics of the API.

**Duplicate headers are still a runtime concern.** The type system does not model
a headers object with repeated keys, so the converter reports that limitation the
same way it does for JavaScript.
