---
slug: curl-to-crystal
title: cURL to Crystal HTTP::Client Converter | CurlToCode
description: Convert cURL to Crystal HTTP::Client code with repeated headers, exact bodies, authentication, multipart encoding, file data, and redirect limitations.
heading: Convert cURL to Crystal
eyebrow: Crystal standard-library HTTP
lede: Generate Crystal request code with append-only HTTP headers and local file handling, while clearly refusing unsupported redirect following.
language: crystal
client: httpclient
languageLabel: Crystal
clientLabel: HTTP::Client
order: 104
faqs:
  - question: Can Crystal HTTP::Client follow redirects automatically?
    answer: Not through the generated standard-library request path. A command with -L is rejected because a correct redirect loop requires decisions beyond one request.
  - question: Are repeated headers preserved?
    answer: Yes. HTTP::Headers add appends another value, so the output does not collapse same-name fields.
  - question: Does the target need a shard?
    answer: No. HTTP::Client and its supporting request types are in Crystal's standard library.
related:
  - curl-to-nim
  - curl-to-ruby
  - curl-to-elixir
  - curl-to-ocaml
---

## Crystal's native HTTP client

The output parses the URI, creates headers with append semantics, constructs the
body, and calls `HTTP::Client` through the standard library. No shard dependency
is required.

Repeated headers survive because `HTTP::Headers#add` stores another value rather
than replacing the current one.

## Bodies, files, and redirects

Serialized body text remains exact. File and multipart content is read only by
the generated Crystal program, with a matching form boundary built for
multipart data.

The standard client does not automatically follow redirects. A command using
`-L` therefore returns a controlled limitation instead of code that silently
stops at a 3xx response.
