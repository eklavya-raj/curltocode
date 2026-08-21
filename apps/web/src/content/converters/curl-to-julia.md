---
slug: curl-to-julia
title: cURL to Julia HTTP.jl Converter | CurlToCode
description: Convert cURL to Julia HTTP.jl code with ordered repeated headers, exact bodies, authentication, redirect control, multipart fields, files, and responses.
heading: Convert cURL to Julia
eyebrow: HTTP.jl request code
lede: Generate Julia HTTP.request calls with pair-vector headers and Form encoding that retain request order and explicit redirect intent.
language: julia
client: http
languageLabel: Julia
clientLabel: HTTP.jl
order: 97
faqs:
  - question: How does Julia preserve duplicate headers?
    answer: HTTP.jl accepts a vector of Pair values, so each header remains an ordered entry even when a name repeats.
  - question: Does HTTP.jl follow redirects in generated code?
    answer: Only when the original command contained -L. The redirect keyword is always written as true or false to make the policy deterministic.
  - question: How are multipart forms constructed?
    answer: Text and file entries become HTTP.Form parts, with file paths opened by the generated Julia program and metadata retained where supported.
related:
  - curl-to-r
  - curl-to-python
  - curl-to-matlab
  - curl-to-nim
---

## Ordered Julia request data

The output calls `HTTP.request` with the exact method and URL. Headers are a
vector of pairs rather than a dictionary, preserving same-name fields and their
order.

Serialized JSON, forms, and text remain their original content. File bodies are
opened by the generated program; the browser converter only writes the path.

## Multipart and redirects

Multipart input uses `HTTP.Form` and file values suitable for HTTP.jl's encoder.
The client owns the boundary, ensuring the content-type header matches the body
it emits.

The `redirect` keyword is always present. This makes a default cURL command stop
at its first 3xx, while a command with `-L` follows according to HTTP.jl's
bounded policy.

Install the package with `using Pkg; Pkg.add("HTTP")`.
