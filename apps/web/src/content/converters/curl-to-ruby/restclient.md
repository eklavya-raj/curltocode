---
slug: curl-to-ruby/restclient
parent: curl-to-ruby
title: cURL to Ruby rest-client Converter | CurlToCode
description: Convert cURL to Ruby RestClient::Request code with custom methods, redirect budgets, exact bodies, basic auth, multipart files, and error responses.
heading: Convert cURL to Ruby rest-client
eyebrow: Explicit Ruby request execution
lede: Generate rest-client requests through the generic execute API, recovering HTTP error responses instead of letting them escape unseen.
language: ruby
client: restclient
languageLabel: Ruby
clientLabel: rest-client
order: 66
faqs:
  - question: Why is the request wrapped in begin and rescue?
    answer: rest-client raises ExceptionWithResponse for non-2xx statuses, while cURL normally returns those response bodies. Recovering error.response keeps completed HTTP exchanges visible to the caller.
  - question: How are redirects represented?
    answer: max_redirects is zero without -L and a finite normal budget with it. This avoids rest-client following a redirect absent from the original command.
  - question: Can rest-client retain a declared multipart media type?
    answer: Not through its hash-based multipart API, which derives type information from the file. Net::HTTP or Faraday should be used when an explicit per-file Content-Type must be retained.
related:
  - curl-to-ruby
  - curl-to-ruby/httparty
  - curl-to-ruby/faraday
  - curl-to-ruby/nethttp
---

## The generic execute API

`RestClient::Request.execute` accepts the method as a symbol, so the output does
not need a separate positional signature for each standard verb. The options
also carry headers, credentials, payload, and a redirect budget.

rest-client's default exception policy differs from cURL. The generated rescue
captures `ExceptionWithResponse` and retains its response so a 404 or 500 body
can still be printed. Transport failures without a response continue to surface.

## Payloads and files

Serialized bodies pass as strings. A raw file is opened in binary mode.
Multipart output uses a payload hash marked with `multipart: true`, with file
parts represented as `File` objects.

That hash cannot preserve repeated part names, and it does not reliably accept
an explicitly declared per-file media type. Those inputs receive a limitation
instead of losing information.

## Redirect and header constraints

A zero redirect budget matches cURL without `-L`; a finite budget represents an
opt-in to following. Request headers are a hash, so repeated names are rejected.

Install the gem with `gem install rest-client`.
