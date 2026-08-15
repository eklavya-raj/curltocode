---
slug: curl-to-ruby/faraday
parent: curl-to-ruby
title: cURL to Ruby Faraday Converter | CurlToCode
description: Convert cURL commands to Ruby Faraday code with raw bodies, authentication, cookies, redirect middleware, multipart uploads, and explicit limitations.
heading: Convert cURL to Ruby Faraday
eyebrow: Faraday HTTP abstraction
lede: Generate Faraday 2 request code with only the middleware gems required by the original cURL command and no hidden request execution.
language: ruby
client: faraday
languageLabel: Ruby
clientLabel: Faraday
order: 61
faqs:
  - question: Why use Faraday instead of Net HTTP directly?
    answer: Faraday provides a stable request interface over multiple adapters and a middleware pipeline for authentication, retries, instrumentation, parsing, and testing. Net HTTP remains the dependency-free option for smaller scripts.
  - question: Why does redirect conversion add another gem?
    answer: Faraday 2 moved automatic redirect handling into the faraday-follow_redirects middleware package. The dependency hint includes it only when the original command uses curl -L.
  - question: Can Faraday preserve duplicate header names?
    answer: Its ordinary request interface uses a header hash, so duplicate names cannot be represented safely. The generator reports that limitation instead of selecting one value.
related:
  - curl-to-ruby
  - curl-to-ruby/nethttp
  - curl-to-php/guzzle
  - curl-to-python/httpx
  - ruby-to-curl/faraday
---

## Connection and middleware setup

The generated source creates a `Faraday` connection, installs only the
middleware the request needs, and finishes with the default adapter. Ordinary
requests need only the `faraday` gem. Multipart bodies add
`faraday-multipart`; `-L` adds `faraday-follow_redirects`.

The call goes through `run_request`, which takes a method symbol, URL, body, and
headers. That generic path supports extension methods without selecting an
incorrect convenience function.

## Body and multipart behavior

Serialized JSON, text, and form data remain raw strings. Binary file bodies use
`File.binread`. Multipart files use `Faraday::Multipart::FilePart`, retaining
their local path, media type, and posted filename.

Faraday's multipart encoder begins with a hash. A repeated part name can require
array conventions that change field spelling or order, so this generator
currently reports repeated multipart names rather than guessing what the server
accepts.

## Faraday-specific constraints

**Headers are hash-backed.** Repeated header names are an explicit limitation;
ordinary distinct headers remain unchanged.

**Redirects are middleware, not an adapter default.** The generated dependency
and connection setup change together when `-L` is present.

**Adapters can behave differently.** The snippet uses Faraday's default adapter.
If your application selects Typhoeus, Excon, or another adapter, keep the same
request shape but validate adapter-specific TLS and streaming behavior.
