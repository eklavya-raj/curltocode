---
slug: curl-to-rust
title: cURL to Rust Converter – reqwest | CurlToCode
description: Convert cURL commands to async Rust reqwest code. Headers, JSON bodies, forms, multipart uploads, cookies, and basic auth are preserved exactly.
heading: Convert cURL to Rust
eyebrow: Async HTTP with reqwest
lede: Generate an async reqwest client and request chain that keeps your method, headers, cookies, authentication, and request body intact.
language: rust
client: reqwest
languageLabel: Rust
clientLabel: reqwest
order: 70
faqs:
  - question: Which crates and features do I need?
    answer: reqwest and tokio. Multipart requests additionally need reqwest's multipart feature, which is not enabled by default. The converter reports the exact Cargo dependency lines alongside the generated code, including the feature flag when it is required.
  - question: Is the generated code async or blocking?
    answer: Async. The output is a complete tokio::main function returning Result, using .send().await. reqwest also ships a blocking client behind its blocking feature, but async is the default that most projects use.
  - question: How does reqwest handle redirects compared to curl?
    answer: reqwest follows up to ten redirects by default, which is the opposite of cURL. When the original command did not pass -L, the generated code builds the client with redirect::Policy::none() so the behaviour matches.
related:
  - curl-to-go
  - curl-to-java
  - curl-to-typescript
---

## How the Rust output is structured

The generated program is a complete `#[tokio::main]` function returning
`Result<(), Box<dyn std::error::Error>>`, which lets every fallible step use the
`?` operator instead of unwrapping. The client is built once, then the request is
composed as a builder chain and awaited.

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
