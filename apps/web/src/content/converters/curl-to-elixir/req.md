---
slug: curl-to-elixir/req
parent: curl-to-elixir
title: cURL to Elixir Req Converter | CurlToCode
description: Convert cURL to Elixir Req code with tuple headers that keep duplicates, exact bodies, streamed files, basic auth, multipart forms, and explicit redirects.
heading: Convert cURL to Elixir Req
eyebrow: Composable BEAM client
lede: Generate Req calls that keep header order and repetition, stream files from disk, and state the redirect policy the cURL command actually asked for.
language: elixir
client: req
languageLabel: Elixir
clientLabel: Req
order: 941
faqs:
  - question: Does Req preserve a repeated header name?
    answer: Yes. Req takes headers as a list of name and value tuples rather than a map, so a name that appears twice in the cURL command is sent twice.
  - question: How does Req send a file without loading it into memory?
    answer: Both a raw file body and a multipart file part use File.stream!, so the payload is read lazily from disk instead of being buffered into a binary first.
  - question: Why is basic auth an option rather than a header?
    answer: Req has a first-class basic auth option, so the credentials stay readable in the generated code instead of being folded into a base64 Authorization header.
related:
  - curl-to-elixir
  - curl-to-elixir/httpoison
  - curl-to-clojure
  - curl-to-ruby
---

## One call for every verb

The output is a single `Req.request!` call with `method:` and `url:` as
options. A custom verb needs no different shape than GET or POST, because the
method is data rather than a function name.

Headers are emitted as a list of `{name, value}` tuples. That is what keeps a
repeated header name intact: a map would silently collapse two `Set-Cookie` or
two `X-Forwarded-For` values into one.

## Bodies, files, and multipart forms

A JSON or form-urlencoded body is passed through as the original bytes under
`body:`. Req is not asked to encode a map, because encoding a map would
re-serialize the payload and can reorder keys or change spacing.

Multipart input becomes `form_multipart:`. Text fields are plain tuples; file
parts are `File.stream!` with a `filename:` and, when cURL declared one, a
`content_type:`. The `Content-Type` header is dropped for multipart requests
because Req generates the boundary itself.

## Redirects are always stated

`redirect:` is written from the cURL `-L` state on every request, so the
generated code never inherits a default that disagrees with the command it came
from.

Add `{:req, "~> 0.7"}` to your `mix.exs` dependencies.
