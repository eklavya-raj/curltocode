---
slug: curl-to-elixir/httpoison
parent: curl-to-elixir
title: cURL to Elixir HTTPoison Converter | CurlToCode
description: Convert cURL to Elixir HTTPoison code with ordered header tuples, Hackney multipart uploads, file bodies, basic auth, and an explicit follow_redirect option.
heading: Convert cURL to Elixir HTTPoison
eyebrow: Established Hackney client
lede: Generate HTTPoison.request! calls for applications already built on Hackney, with the body, headers, and redirect option written out in full.
language: elixir
client: httpoison
languageLabel: Elixir
clientLabel: HTTPoison
order: 942
faqs:
  - question: Why does the output call HTTPoison.request! directly?
    answer: The five-argument form takes the method, URL, body, headers, and options in one call, so a custom verb is expressed exactly the same way as GET or POST.
  - question: How are multipart uploads represented?
    answer: As a multipart tuple body in Hackney form. File parts carry the path, the form-data disposition with its name and filename, and any declared part media type.
  - question: Why is the Content-Type header removed from a multipart request?
    answer: Hackney generates the multipart boundary itself, so a Content-Type copied from the cURL command would name a boundary that does not appear in the body.
related:
  - curl-to-elixir
  - curl-to-elixir/req
  - curl-to-ruby/faraday
  - curl-to-clojure
---

## The five-argument request form

HTTPoison exposes per-verb helpers, but the generator always emits
`HTTPoison.request!/5`. It takes the method atom, the URL, the body, the
headers, and the options, which means one shape covers every request rather
than one shape per verb.

Headers are a list of `{name, value}` tuples, so a repeated name survives.
Basic credentials and cookies are materialized as headers, which is precisely
what cURL puts on the wire for `-u` and `-b`.

## Bodies

A body with no payload is the empty binary rather than `nil`, matching what
cURL sends for a POST with no data. Textual bodies are passed through unchanged.

A `--data-binary @file` body becomes `{:file, path}`, and a multipart request
becomes `{:multipart, ...}` with Hackney's file tuples. Neither form loads the
file into the BEAM heap first.

## Redirects

`follow_redirect:` is always present in the options list and always mirrors
`-L`. HTTPoison does not follow redirects unless told to, but writing the flag
either way keeps the generated code readable next to the original command.

Add `{:httpoison, "~> 2.2"}` to your `mix.exs` dependencies.
