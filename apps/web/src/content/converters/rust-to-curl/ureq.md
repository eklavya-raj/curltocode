---
direction: code-to-curl
slug: rust-to-curl/ureq
parent: rust-to-curl
title: Rust ureq to cURL Command Converter | CurlToCode
description: Convert Rust ureq requests back into a cURL command, reading http::Request builders, byte-string method literals, header calls, bodies, and redirect limits.
heading: Convert Rust ureq to a cURL command
eyebrow: ureq parser
lede: Read a ureq request builder and recover the equivalent cURL command, including its byte-string method literal, without compiling anything.
language: rust
client: ureq
languageLabel: Rust
clientLabel: ureq
order: 192
faqs:
  - question: How is the method read from a byte-string literal?
    answer: ureq builds its method with http::Method::from_bytes(b"POST"). The byte-string prefix is recognised so the literal is read as the method it names rather than dropped.
  - question: Which ureq calls are read?
    answer: The http::Request builder's method, uri, header, and body calls, along with the agent configuration that sets a redirect limit.
  - question: What happens when a value cannot be resolved?
    answer: It is reported with the expression responsible. The parser never executes the code, so a value that only exists at run time becomes a named limitation rather than an invented one.
related:
  - rust-to-curl/reqwest
  - rust-to-curl
  - curl-to-rust/ureq
  - java-to-curl/httpclient
---

## The http::Request builder

ureq builds on the `http` crate's request builder, so `method`, `uri`,
`header`, and `body` carry the request. The method is usually written as
`http::Method::from_bytes(b"POST")`, and the byte-string literal is read as the
method it names.

## Bodies

`body` supplies the payload, and its representation follows the content type the
headers declare rather than being assumed from the call.

## Redirects

ureq caps redirects through its agent configuration. A limit of zero means the
generated command carries no redirect flag.
