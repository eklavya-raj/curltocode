---
slug: curl-to-ruby
title: cURL to Ruby Converter – Net::HTTP | CurlToCode
description: Convert cURL commands to Ruby Net::HTTP code in your browser. Headers, JSON bodies, forms, multipart uploads, cookies, and basic auth are preserved.
heading: Convert cURL to Ruby
eyebrow: Ruby standard library
lede: Generate Net::HTTP request code with no gems required, keeping your method, headers, cookies, authentication, and request body intact.
language: ruby
client: nethttp
languageLabel: Ruby
clientLabel: Net::HTTP
order: 60
faqs:
  - question: Does Net::HTTP follow redirects like curl -L?
    answer: No, and this is the one behaviour the converter cannot reproduce with configuration alone. Net::HTTP never follows redirects automatically. When the original command used -L, the generated code carries a comment explaining that you must check for Net::HTTPRedirection and reissue the request yourself.
  - question: Why does the code use add_field instead of the bracket setter?
    answer: The bracket setter replaces any existing value for that header name, which would silently drop a repeated header. add_field appends, so a command with two headers of the same name produces two headers on the wire, matching cURL.
  - question: Do I need the httparty or faraday gem?
    answer: No. Net::HTTP and URI are both part of the Ruby standard library, so the generated code runs on a stock installation with no Gemfile and no bundle install step.
related:
  - curl-to-python
  - curl-to-php
  - curl-to-go
---

## How the Ruby output is structured

The generated script parses the URL with `URI`, builds a request object from the
matching `Net::HTTP` class, applies headers and authentication, and then runs it
inside `Net::HTTP.start`. Using the block form guarantees the connection is
closed even if the request raises.

TLS is enabled by comparing the parsed scheme rather than hardcoding a port, so
the same shape works for both `http` and `https` URLs.

## Methods, bodies, and uploads

Net::HTTP models each verb as its own class — `Net::HTTP::Get`,
`Net::HTTP::Post`, and so on. The converter maps the standard verbs onto those
classes and reports an explicit limitation for anything outside that set, such
as a custom `PURGE` method, rather than emitting code that will not resolve.

Multipart requests use `set_form` with an explicit `multipart/form-data`
argument. Text fields are name/value pairs, and file parts carry an opened
`File` plus a metadata hash with the posted filename and media type.

## Common conversion issues

**Redirect handling is yours to write.** This is the most frequent surprise when
moving from cURL to Ruby. A `301` or `302` comes back as an ordinary response
object; nothing is retried for you.

**`basic_auth` is a request method, not a header.** The generated code calls
`request.basic_auth` so Ruby performs the base64 encoding. Building the
`Authorization` header by hand is a common source of padding mistakes.

**`File.open` in a multipart form is not closed for you.** For a short script
this is harmless, but in long-running code you should manage the handle
explicitly or read the bytes up front.
