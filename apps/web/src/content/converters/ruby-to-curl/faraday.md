---
direction: code-to-curl
slug: ruby-to-curl/faraday
parent: ruby-to-curl
title: Faraday to cURL Command Converter | CurlToCode
description: Convert Ruby Faraday requests back into a cURL command, reading run_request with its method, URL, body, and header hash, plus the follow_redirects middleware.
heading: Convert Ruby Faraday to a cURL command
eyebrow: Faraday parser
lede: Read a Faraday request and recover the equivalent cURL command, resolving its arguments without building a connection or sending anything.
language: ruby
client: faraday
languageLabel: Ruby
clientLabel: Faraday
order: 182
faqs:
  - question: Which Faraday call shapes are read?
    answer: run_request, which takes the method, URL, body, and header hash as positional arguments. A symbol method such as "post".to_sym is read through its conversion.
  - question: How is redirect behaviour determined?
    answer: Faraday follows redirects only when the follow_redirects middleware is installed on the connection. The generated command carries the redirect flag only when that middleware appears.
  - question: What happens when a value cannot be resolved?
    answer: It is reported with the expression responsible. The parser never executes the code, so a value that only exists at run time becomes a named limitation rather than an invented one.
related:
  - ruby-to-curl/nethttp
  - ruby-to-curl
  - curl-to-ruby/faraday
  - php-to-curl/guzzle
---

## One call carries the request

Faraday's `run_request` takes the method, URL, body, and headers positionally,
so a single call supplies the whole request. A method written as a symbol is
read through its conversion rather than stopping the argument list.

## Redirects are middleware

Unlike most clients here, Faraday's redirect behaviour is a middleware decision
rather than an option. The redirect flag appears only when
`faraday.response :follow_redirects` is present on the connection.
