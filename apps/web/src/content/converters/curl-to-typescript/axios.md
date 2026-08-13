---
slug: curl-to-typescript/axios
parent: curl-to-typescript
title: cURL to TypeScript Axios Converter | CurlToCode
description: Convert cURL commands to typed TypeScript Axios code with a satisfies AxiosRequestConfig assertion, explicit maxRedirects, headers, cookies, and auth.
heading: Convert cURL to TypeScript Axios
eyebrow: Typed Axios requests
lede: Generate a single typed Axios config object, checked against AxiosRequestConfig so an unknown option is a build error rather than a silently ignored key.
language: typescript
client: axios
languageLabel: TypeScript
clientLabel: Axios
order: 27
faqs:
  - question: Why generate one config object instead of axios.post style calls?
    answer: The config form expresses every request the same way, whatever the method. That matters for conversion fidelity, because cURL allows arbitrary method tokens and per-method helpers do not. It also keeps the whole request visible in one object, which reviews more easily than arguments spread across positions.
  - question: Why is maxRedirects set to zero?
    answer: Axios follows redirects by default and cURL does not, so leaving it out would change what your request actually does. Setting maxRedirects to 0 matches plain cURL. A command with -L omits the option so Axios follows normally.
  - question: Does Axios need a Content-Type set manually?
    answer: Axios infers a content type from the data you pass, which can differ from what your original command sent. The generator writes the header explicitly so the request on the wire matches the cURL command byte for byte rather than depending on inference.
related:
  - curl-to-typescript
  - curl-to-javascript/axios
  - curl-to-typescript/fetch
---

## One typed config object

The output imports both the default export and the `AxiosRequestConfig` type,
then applies `satisfies` to the config. As with the Fetch target, the assertion
checks every key while keeping the literal's narrower types, so a typo like
`headres` fails the build rather than being dropped at runtime.

Every request uses the same `axios({ ... })` shape regardless of method. This is
deliberate: cURL accepts arbitrary method tokens through `-X`, and the
`axios.post`-style helpers cannot express them. One form handles all of them and
keeps the entire request readable in a single object.

## Redirects and content types are explicit

Two Axios defaults differ from cURL, and both are written out rather than left
implicit.

Axios follows redirects; cURL does not unless you pass `-L`. The generated
config sets `maxRedirects: 0` to match, and omits it when your command has
`-L`. Axios also infers a `Content-Type` from whatever you pass as `data`, which
may not be what your command sent, so the header is always stated explicitly.

Note that `maxRedirects: 0` only applies on Node. In a browser, Axios runs on
XMLHttpRequest, which follows redirects with no way to opt out.

## Authentication and cookies

Basic credentials arrive as a pre-encoded `Authorization` header rather than
Axios's `auth` option, which keeps the header ordering identical to cURL's.
Bearer tokens pass through unchanged, and `-b` cookies become a single `Cookie`
header. In a browser that header is forbidden and will be stripped, so cookie
handling there has to go through the browser's own cookie jar.

## Current Axios limitations

**A local file in a multipart upload is rejected.** `-F 'file=@photo.png'` reads
from disk, which browser JavaScript cannot do unprompted. Rather than emit code
that uploads nothing, the converter reports the limitation. On Node, pass a
`fs.createReadStream` into a `FormData` yourself.

**Duplicate header names collapse.** A config object cannot carry the same key
twice, so a command repeating a header cannot round-trip through this target.
The [Undici target](/curl-to-typescript/undici) preserves repeats through its
flat header array.

Install the dependency with `npm install axios`.
