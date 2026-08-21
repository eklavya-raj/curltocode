---
slug: curl-to-ruby/httparty
parent: curl-to-ruby
title: cURL to Ruby HTTParty Converter | CurlToCode
description: Convert cURL to concise Ruby HTTParty calls with headers, basic authentication, exact bodies, redirect settings, multipart fields, and local files.
heading: Convert cURL to Ruby HTTParty
eyebrow: Concise Ruby HTTP calls
lede: Generate familiar HTTParty class-method requests for standard HTTP verbs, with explicit multipart and redirect behaviour.
language: ruby
client: httparty
languageLabel: Ruby
clientLabel: HTTParty
order: 65
faqs:
  - question: Can HTTParty send a custom HTTP method?
    answer: Its public class API exposes named methods for standard verbs rather than a generic arbitrary-method call. Unsupported extension methods produce a limitation instead of being forced through the wrong helper.
  - question: What multipart cases cannot be represented?
    answer: HTTParty's hash cannot preserve repeated field names, and file media types are derived from disk rather than a declared cURL type. Use Net::HTTP or Faraday when either detail matters.
  - question: How is basic authentication represented?
    answer: Username and password become HTTParty's structured basic_auth option. Bearer tokens and cookies remain ordinary request headers.
related:
  - curl-to-ruby
  - curl-to-ruby/restclient
  - curl-to-ruby/faraday
  - curl-to-ruby/nethttp
---

## A compact standard-verb API

HTTParty maps standard methods to class calls such as `HTTParty.get` and
`HTTParty.post`. Options contain headers, basic credentials, body data, and the
redirect flag. The response body is printed directly.

Because the library does not expose the same surface for arbitrary extension
verbs, those methods are rejected rather than mapped to a different request.

## Body and multipart behaviour

Serialized content goes into `body` unchanged. File-backed raw bodies use
`File.binread`. Multipart forms set `multipart: true`, put text values in the
body hash, and open file values locally when the generated program runs.

The hash cannot hold a repeated multipart name. HTTParty also derives a file
part's media type rather than accepting the explicit cURL declaration through
this API. Both cases return a targeted limitation.

## Header constraints

Request headers are a Ruby hash, so repeated names cannot survive. Basic auth
uses its dedicated option, while redirect following mirrors `-L` through
`follow_redirects`.

Install the gem with `gem install httparty`.
