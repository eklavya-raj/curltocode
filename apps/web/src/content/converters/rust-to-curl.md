---
direction: code-to-curl
slug: rust-to-curl
title: Rust to cURL – reqwest & ureq Converter | CurlToCode
description: Convert static Rust requests to cURL locally, reading reqwest and ureq builders including methods, headers, bodies, multipart forms, and redirect policy.
heading: Convert Rust to cURL
eyebrow: Rust HTTP parser
lede: Turn a reqwest or ureq builder chain into a conventional cURL command, reading through the await and question-mark suffixes without compiling anything.
language: rust
client: reqwest
languageLabel: Rust
clientLabel: reqwest
order: 190
faqs:
  - question: Which Rust HTTP clients can be converted?
    answer: reqwest's Client builder and its verb shorthands, and ureq's agent and http::Request builders, including byte-string method literals and multipart forms.
  - question: Does CurlToCode run the code to work out the request?
    answer: No. Conversion is entirely static. Imports, helper methods, environment access, and the represented HTTP request are never executed, so nothing reaches a server.
  - question: What happens to a value the parser cannot resolve?
    answer: It is reported with the expression responsible rather than replaced by a guess. A URL from a helper call or a header built at run time produces a named limitation instead of an invented command.
related:
  - rust-to-curl/reqwest
  - rust-to-curl/ureq
  - curl-to-rust
  - java-to-curl
---

## Reading a builder chain

Rust expresses a request as a chain of calls, so the parser reads them in order
and folds them together rather than looking for a single expression. Literals,
values assigned once, and static string concatenation are resolved; anything
else is reported.

Rust chains are punctuated by the question-mark operator and await, both of which are transparent to the value being built. A byte-string method literal such as b"POST" is read as the method it names.

## What cannot be resolved safely

A URL returned by a helper, a header computed at run time, or a value read from
configuration cannot be known without executing the program. Each is reported
with the expression that caused it, which is more useful than a command that
looks complete but is wrong.
