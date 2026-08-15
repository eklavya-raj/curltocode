---
direction: code-to-curl
slug: ruby-to-curl/nethttp
parent: ruby-to-curl
title: Ruby Net::HTTP to cURL Command | CurlToCode
description: Convert Ruby Net::HTTP requests back into a cURL command, reading request classes, add_field, subscript headers, basic_auth, body assignment, and set_form.
heading: Convert Ruby Net::HTTP to a cURL command
eyebrow: Net::HTTP parser
lede: Read a Ruby Net::HTTP request and recover the cURL command it stands for, without running the script or issuing the request.
language: ruby
client: nethttp
languageLabel: Ruby
clientLabel: Net::HTTP
order: 181
faqs:
  - question: Where does the method come from?
    answer: The request class names it. Net::HTTP::Post yields POST and Net::HTTP::Get yields GET, so the verb is taken from the constructor rather than from an argument.
  - question: How are headers set?
    answer: Both add_field, which appends and so preserves a repeated name, and subscript assignment such as request["X-Token"] = "abc", which replaces. Each is read accordingly.
  - question: What happens when a value cannot be resolved?
    answer: It is reported with the expression responsible. The parser never executes the code, so a value that only exists at run time becomes a named limitation rather than an invented one.
related:
  - ruby-to-curl/faraday
  - ruby-to-curl
  - curl-to-ruby/nethttp
  - csharp-to-curl/httpclient
---

## The request object

`Net::HTTP::Post.new(uri)` supplies both the method and the URL, resolving the
URI through a variable bound once when the constructor takes one.

Headers arrive through `add_field` or subscript assignment, and `basic_auth`
supplies credentials. The body is a property assignment.

## Form and multipart bodies

`set_form` sends ordered fields. When its media type is multipart the fields
become parts; otherwise they become a urlencoded body.

## Redirects

Net::HTTP never follows redirects on its own, so the generated command carries
no redirect flag.
