---
direction: code-to-curl
slug: typescript-to-curl/undici
parent: typescript-to-curl
title: TypeScript Undici to cURL Converter | CurlToCode
description: Convert typed Node.js Undici request() calls to cURL locally, including Dispatcher.RequestOptions annotations, flat header arrays, and redirect handling.
heading: Convert TypeScript Undici to cURL
eyebrow: Typed Undici parser
lede: Turn a typed undici request() call into a readable cURL command, reading through the annotations and assertions TypeScript adds without executing the source.
language: typescript
client: undici
languageLabel: TypeScript
clientLabel: Undici
order: 123
faqs:
  - question: Do TypeScript type annotations affect the conversion?
    answer: No. Annotations, satisfies expressions, and non-null assertions are erased before the request is read, so a typed options object converts exactly like its JavaScript equivalent.
  - question: Can a typed options constant be resolved?
    answer: Yes, when it is a safe lexical const whose value is statically known. A constant typed as Dispatcher.RequestOptions and never reassigned resolves the same way an inline object literal does.
  - question: What happens to an imported base URL constant?
    answer: An imported value cannot be resolved without executing the module, so it is reported as a dynamic URL issue. Inline the literal, or convert from the equivalent runtime value instead.
related:
  - typescript-to-curl/fetch
  - typescript-to-curl
  - javascript-to-curl/undici
  - curl-to-typescript/undici
---

## Reading a typed Undici request

TypeScript syntax is parsed and then erased before the request is recovered, so
type annotations never change the result. An options constant annotated as
`Dispatcher.RequestOptions`, a `satisfies` expression, and a non-null assertion
all resolve to the same request their untyped equivalents produce.

The first argument supplies the URL, and the options object can provide `method`,
`headers`, `body`, `query`, `maxRedirections`, and `dispatcher`. Headers written
as Undici's flat array of alternating names and values keep every repeated name,
which a plain object cannot express.

## Constants, imports, and inference

A safe lexical `const` in the same module can be resolved and inlined, including
when its type is written out explicitly. That covers the common pattern of
declaring a typed options object beside the call and passing it by name.

An imported constant is a different matter. Resolving it would require executing
the module it came from, which this converter never does, so it is reported as a
dynamic issue instead. The same applies to values produced by a function call,
however precisely they are typed.

## Redirects and unsupported options

Undici does not follow redirects unless asked, so `-L` appears only when the
source sets `maxRedirections` above zero or composes `interceptors.redirect` into
a dispatcher. Options describing connection policy rather than request content
are reported as unsupported rather than being quietly discarded.
