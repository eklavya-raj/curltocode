---
direction: code-to-curl
slug: ruby-to-curl
title: Ruby to cURL – Net::HTTP & Faraday Converter | CurlToCode
description: Convert static Ruby requests to cURL locally, reading Net::HTTP request classes and Faraday calls including headers, form data, multipart, and basic auth.
heading: Convert Ruby to cURL
eyebrow: Ruby HTTP parser
lede: Turn a Ruby Net::HTTP or Faraday request into a conventional cURL command, without running the script or issuing the request it describes.
language: ruby
client: nethttp
languageLabel: Ruby
clientLabel: Net::HTTP
order: 180
faqs:
  - question: Which Ruby HTTP clients can be converted?
    answer: Net::HTTP request classes such as Net::HTTP::Post, including add_field, subscript header assignment, basic_auth, and set_form, plus Faraday's run_request.
  - question: Does CurlToCode run the code to work out the request?
    answer: No. Conversion is entirely static. Imports, helper methods, environment access, and the represented HTTP request are never executed, so nothing reaches a server.
  - question: What happens to a value the parser cannot resolve?
    answer: It is reported with the expression responsible rather than replaced by a guess. A URL from a helper call or a header built at run time produces a named limitation instead of an invented command.
related:
  - ruby-to-curl/nethttp
  - ruby-to-curl/faraday
  - curl-to-ruby
  - rust-to-curl
---

## Reading a builder chain

Ruby expresses a request as a chain of calls, so the parser reads them in order
and folds them together rather than looking for a single expression. Literals,
values assigned once, and static string concatenation are resolved; anything
else is reported.

Net::HTTP names the verb in the request class, so the method comes from the constructor rather than an argument. Headers arrive through add_field or subscript assignment, and set_form sends ordered parts when its media type is multipart.

## What cannot be resolved safely

A URL returned by a helper, a header computed at run time, or a value read from
configuration cannot be known without executing the program. Each is reported
with the expression that caused it, which is more useful than a command that
looks complete but is wrong.
