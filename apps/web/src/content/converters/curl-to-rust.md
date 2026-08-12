---
slug: curl-to-rust
title: cURL to Rust Converter – reqwest & ureq | CurlToCode
description: Convert cURL to async reqwest or synchronous ureq Rust code, preserving custom methods, repeated headers, raw bodies, cookies, auth, and redirects.
heading: Convert cURL to Rust
eyebrow: Async and blocking Rust HTTP
lede: Generate async reqwest or synchronous ureq code while keeping methods, headers, cookies, authentication, bodies, and redirect intent intact.
language: rust
client: reqwest
languageLabel: Rust
clientLabel: reqwest
order: 70
faqs:
  - question: Which crates and features do I need?
    answer: reqwest and tokio. Multipart requests additionally need reqwest's multipart feature, which is not enabled by default. The converter reports the exact Cargo dependency lines alongside the generated code, including the feature flag when it is required.
  - question: Is the generated code async or blocking?
    answer: reqwest output is an async Tokio program using send await. ureq output is synchronous and blocks the current thread, making it a smaller fit for command-line tools that do not otherwise need an async runtime.
  - question: How does reqwest handle redirects compared to curl?
    answer: reqwest follows up to ten redirects by default, which is the opposite of cURL. When the original command did not pass -L, the generated code builds the client with redirect::Policy::none() so the behaviour matches.
related:
  - curl-to-rust/ureq
  - curl-to-go
  - curl-to-java
  - curl-to-typescript
---

## How the Rust output is structured

The generated program is a complete `#[tokio::main]` function returning
`Result<(), Box<dyn std::error::Error>>`, which lets every fallible step use the
`?` operator instead of unwrapping. The client is built once, then the request is
composed as a builder chain and awaited.

The ureq alternative builds a stable `http::Request` and runs it through a
synchronous `Agent`. It needs no Tokio runtime and preserves repeated headers,
but currently reports multipart because ureq exposes that API as unversioned.

Standard verbs use the associated constants on `reqwest::Method`, such as
`Method::POST`. A non-standard verb falls back to `Method::from_bytes` with a
byte-string literal, which is safe because cURL has already validated the method
as an HTTP token.

## Bodies, headers, and uploads

String bodies are passed to `.body(...)` as a literal. Because the literal has a
`'static` lifetime, it converts into a `reqwest::Body` without an allocation or
an explicit `to_string()` call.

Multipart requests build a `reqwest::multipart::Form`. Text fields use `.text`,
and file parts read the bytes with `std::fs::read` and wrap them in a `Part` that
carries the posted filename and, when the command specified one, an explicit
media type through `.mime_str`.

## Common conversion issues

**The multipart feature is opt-in.** If the compiler cannot find
`reqwest::multipart::Form`, `features = ["multipart"]` is almost certainly
missing from the reqwest dependency.

**`.header()` appends rather than replaces.** Repeating a header name produces
two values on the wire, matching cURL. If you want replace semantics you have to
build a `HeaderMap` yourself.

**Basic auth is a builder call, not a header.** The generated code uses
`.basic_auth(user, Some(password))` so reqwest performs the encoding. Passing
`None` for the password is valid and sends an empty password, which is not the
same as omitting authentication.
