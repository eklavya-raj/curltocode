---
direction: code-to-curl
slug: ruby-to-curl/restclient
parent: ruby-to-curl
title: rest-client to cURL Command Converter | CurlToCode
description: Convert rest-client requests into a cURL command, reading the execute options hash and the per-verb shortcuts including payload, headers, user, and max_redirects.
heading: Convert rest-client to a cURL command
eyebrow: rest-client parser
lede: Read either rest-client call shape and recover the request, including the method it carries as a symbol.
language: ruby
client: restclient
languageLabel: Ruby
clientLabel: rest-client
order: 184
faqs:
  - question: Which call shapes are supported?
    answer: RestClient::Request.execute with its options hash, and the per-verb shortcuts such as RestClient.post, which take the URL, the payload, and a header hash.
  - question: How is the method read from a symbol?
    answer: The options hash names the verb as a Ruby symbol such as :patch. The reader recognises that syntax and takes the name, so any verb converts.
  - question: What does max_redirects zero mean?
    answer: That the request stops at the first response, which becomes a command without -L. rest-client otherwise follows up to its own budget.
related:
  - ruby-to-curl
  - ruby-to-curl/httparty
  - curl-to-ruby/restclient
  - ruby-to-curl/faraday
---

## Two shapes, one reader

`RestClient::Request.execute` puts everything in one keyword hash, which is
the form that supports every option. The per-verb shortcuts are shorter and
take the payload and the headers positionally instead.

Both are read here, because both turn up in real code and neither is a subset
of the other.

## Payloads

`payload` may be a string, which is sent as written, or a hash, which
rest-client form-encodes. A hash brings the urlencoded content type with it, so
the converted command declares what it is sending.

## Credentials and redirects

`user` and `password` are separate options rather than a nested hash, and
they become the command's credentials. `max_redirects` is a count: zero means
the request stops where it started.
