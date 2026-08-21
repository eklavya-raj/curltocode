---
slug: curl-to-ocaml
title: cURL to OCaml Cohttp Converter | CurlToCode
description: Convert cURL to OCaml Cohttp Lwt code with repeated headers, exact bodies, authentication, multipart encoding, local files, and explicit redirect limits.
heading: Convert cURL to OCaml
eyebrow: Cohttp with Lwt
lede: Generate asynchronous Cohttp_lwt_unix requests with append-only headers and exact bodies, while refusing redirect following the client does not provide.
language: ocaml
client: cohttp
languageLabel: OCaml
clientLabel: Cohttp
order: 100
faqs:
  - question: Why is cURL -L unsupported for Cohttp?
    answer: Cohttp's basic client call returns the 3xx response and does not implement a redirect loop. Generating one correctly would require method, location, credential, and cycle decisions beyond one request.
  - question: Can Cohttp preserve repeated headers?
    answer: Yes. Cohttp.Header.add appends another value, so ordered repeated names remain represented.
  - question: How are responses handled?
    answer: The generated Lwt program awaits the client call, converts the response body to a string, prints it, and runs through Lwt_main.
related:
  - curl-to-elixir
  - curl-to-crystal
  - curl-to-scala
  - curl-to-nim
---

## Cohttp and Lwt

The generated program constructs Cohttp headers and a body, then calls the Lwt
Unix client with the exact method and URI. The asynchronous result is driven by
`Lwt_main.run` for a complete standalone example.

Header construction uses `Header.add`, which retains repeated fields. Serialized
content remains a string, while file-backed and multipart bodies read local data
only when the OCaml program executes.

## Redirect limitation

Cohttp does not follow redirects in this call surface. A command with `-L`
therefore produces a limitation rather than source that stops at the first 3xx.
Applications that implement their own redirect loop need to define cross-origin
credentials and method rewriting explicitly.

Install the runtime package with `opam install cohttp-lwt-unix`.
