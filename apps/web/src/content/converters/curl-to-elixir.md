---
slug: curl-to-elixir
title: cURL to Elixir – Req & HTTPoison | CurlToCode
description: Convert cURL to Elixir Req or HTTPoison code with tuple-list headers, exact bodies, authentication, redirects, multipart forms, local files, and cookies.
heading: Convert cURL to Elixir
eyebrow: Modern and established BEAM clients
lede: Generate requests for Req's composable API or HTTPoison's established Hackney-backed interface while preserving ordered header tuples.
language: elixir
client: req
languageLabel: Elixir
clientLabel: Req
order: 94
faqs:
  - question: Should I choose Req or HTTPoison?
    answer: Req is the modern batteries-included choice with a composable step pipeline. HTTPoison remains common in established applications and exposes a familiar request function over Hackney.
  - question: Do the Elixir targets preserve repeated headers?
    answer: Yes. Both clients accept a list of name-value tuples, so the same name can appear more than once without being overwritten by a map.
  - question: Can both clients create multipart uploads?
    answer: Yes. Req uses form_multipart entries and HTTPoison uses Hackney-compatible multipart tuples, retaining fields, file paths, filenames, and supported media types.
related:
  - curl-to-clojure
  - curl-to-crystal
  - curl-to-ruby
  - curl-to-ocaml
---

## Req and HTTPoison

Req is the default recommendation for new Elixir request code. Its options make
the method, URL, headers, body, redirect policy, and multipart data explicit,
and its pipeline is easy to extend with project-specific steps.

HTTPoison is valuable in codebases already using its response structs and
Hackney adapter. The generator calls its generic request API so custom methods
do not depend on separate convenience functions.

## Tuple lists preserve request structure

Both outputs represent headers as ordered tuples. Repeated names survive, which
is important for protocols that distinguish multiple field lines from one
comma-joined value.

Serialized bodies remain binaries rather than being decoded and re-encoded.
Multipart output uses each library's native form representation, and file paths
are only read when the generated Elixir executes.

## Redirects and dependencies

Req receives a boolean redirect option; HTTPoison's options set follow behavior
to match `-L`. HTTP status responses remain response values rather than being
confused with transport errors.

Use `{:req, "~> 0.7"}` for Req or `{:httpoison, "~> 2.2"}` for HTTPoison.
