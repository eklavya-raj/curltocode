---
slug: curl-to-rust/ureq
parent: curl-to-rust
title: cURL to Rust ureq Converter | CurlToCode
description: Convert cURL commands to synchronous Rust ureq 3.3 code with custom methods, repeated headers, raw or file bodies, cookies, auth, and redirect control.
heading: Convert cURL to Rust ureq
eyebrow: Synchronous Rust HTTP
lede: Generate small blocking ureq programs through its stable http Request interface, with redirect and HTTP-status behavior configured explicitly.
language: rust
client: ureq
languageLabel: Rust
clientLabel: ureq
order: 71
faqs:
  - question: When should I use ureq instead of reqwest?
    answer: ureq is a strong fit for synchronous command-line tools and services that want a smaller blocking API without an async runtime. reqwest is the better default when the surrounding application already uses Tokio or needs stable multipart support.
  - question: Why does the generator build an http Request directly?
    answer: The http crate request builder supports arbitrary validated methods, repeated headers, and several body types through one stable path. ureq re-exports those HTTP types, so no extra direct dependency is required.
  - question: Why is multipart currently rejected?
    answer: ureq 3.3 exposes multipart under its explicitly unversioned module, whose API is not covered by normal semantic-versioning guarantees. CurlToCode avoids generating a foundation that can break on a patch release.
related:
  - curl-to-rust
  - curl-to-go/resty
  - curl-to-java/apache-httpclient
  - rust-to-curl/ureq
---

## A synchronous stable API

The output builds an `ureq::http::Request` and runs it through an `Agent`. This
works for standard and custom method tokens, and repeated `.header` calls append
values to the request's `HeaderMap`.

Agent configuration states both redirect and status handling. `max_redirects`
is zero unless the cURL command contains `-L`, and `http_status_as_error(false)`
lets the example print 4xx or 5xx responses instead of turning them into control
flow errors that cURL did not request.

## Raw and file request bodies

JSON, text, URL-encoded forms, and inline binary data are passed as their
original strings. A file body becomes `std::fs::File::open`, which ureq streams
with chunked transfer unless the request supplied its own length information.

Basic credentials, bearer tokens, and cookies become headers in the normalized
order. No JSON feature is required because the converter deliberately avoids
serializing the already serialized payload.

## Current ureq limitations

**Multipart is not generated yet.** The crate labels the available multipart
surface unversioned. The converter shows this as a limitation in its multipart
example rather than producing code with unstable imports.

**Redirecting bodies can fail on 307 or 308.** ureq refuses to replay some
non-rewindable bodies. If your endpoint uses those redirects, choose reqwest or
provide an application-specific replay policy.

**This client blocks the current thread.** Use it for synchronous programs; use
the reqwest target when blocking would stall an async executor.
