---
direction: code-to-curl
slug: ruby-to-curl/httparty
parent: ruby-to-curl
title: HTTParty to cURL Command Converter | CurlToCode
description: Convert HTTParty calls into a cURL command, reading headers, body, basic_auth, query, multipart, and follow_redirects keyword options without running the script.
heading: Convert HTTParty to a cURL command
eyebrow: HTTParty parser
lede: Read HTTParty's keyword options and recover the request, credentials and redirect policy included.
language: ruby
client: httparty
languageLabel: Ruby
clientLabel: HTTParty
order: 183
faqs:
  - question: Which options are read?
    answer: headers, body, query, basic_auth, multipart, and follow_redirects. Each is taken from its keyword label rather than from its position in the argument list.
  - question: How are credentials recovered?
    answer: From basic_auth, which is a hash with username and password keys. Both are read into the command's -u option rather than into a precomputed header.
  - question: Does HTTParty follow redirects by default?
    answer: Yes, so a call that says nothing about them converts to a command with -L. An explicit follow_redirects false turns that off.
related:
  - ruby-to-curl
  - ruby-to-curl/nethttp
  - curl-to-ruby/httparty
  - ruby-to-curl/restclient
---

## One module method per verb

`HTTParty.get`, `HTTParty.post`, and the rest take the URL first and
everything else as keyword arguments. Ruby collects those into a trailing hash,
so the labels are what tell headers from a body from a redirect setting, and
the reader keeps them rather than reading by position.

## Bodies

`body` may be a string, which is sent as it is, or a hash, which HTTParty
form-encodes. Both are recovered, and the hash form brings the urlencoded
content type it implies.

With `multipart: true`, the same hash becomes a multipart form instead, and
the parts come back as fields.

## Credentials

`basic_auth` is a hash with `username` and `password` keys written in Ruby's
bare-word style. Those become real credentials in the converted command, so a
password containing a colon survives rather than being folded into a header.
