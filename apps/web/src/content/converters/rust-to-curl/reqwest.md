---
direction: code-to-curl
slug: rust-to-curl/reqwest
parent: rust-to-curl
title: Rust reqwest to cURL Command Converter | CurlToCode
description: Convert Rust reqwest builders back into a cURL command, reading request and verb shorthands, header calls, bodies, multipart text parts, and redirect policy.
heading: Convert Rust reqwest to a cURL command
eyebrow: reqwest parser
lede: Read a reqwest builder chain and recover the cURL command behind it, reading through await and question-mark suffixes without compiling the crate.
language: rust
client: reqwest
languageLabel: Rust
clientLabel: reqwest
order: 191
faqs:
  - question: Which reqwest calls are read?
    answer: request with an explicit Method, the verb shorthands such as get and post, header, basic_auth, bearer_auth, body, json, and form, plus multipart forms built with text.
  - question: How are await and the question-mark operator handled?
    answer: Both are transparent to the value being built, so they are consumed without ending the chain. A chain punctuated by them reads exactly as one written without.
  - question: What happens when a value cannot be resolved?
    answer: It is reported with the expression responsible. The parser never executes the code, so a value that only exists at run time becomes a named limitation rather than an invented one.
related:
  - rust-to-curl/ureq
  - rust-to-curl
  - curl-to-rust/reqwest
  - go-to-curl/nethttp
---

## The builder chain

`request(Method::POST, url)` supplies the method and URL, and the verb
shorthands do the same in one call. `header` appends fields, and `basic_auth`
and `bearer_auth` supply credentials.

The chain is punctuated by `?` and `.await`, both of which are transparent to
the value and are consumed without interrupting the read.

## Bodies and multipart

`body` supplies a payload whose representation follows the declared content
type, while `json` and `form` imply their own. Multipart forms built with
`Form::new().text(...)` contribute their parts in order.

## Redirects

reqwest follows redirects by default, so the flag is omitted only when the
client is built with `Policy::none()`.
