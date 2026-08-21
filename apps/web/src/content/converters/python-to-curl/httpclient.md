---
direction: code-to-curl
slug: python-to-curl/httpclient
parent: python-to-curl
title: http.client to cURL Converter | CurlToCode
description: Convert Python http.client code into a cURL command, rejoining the connection host with the request target and reading headers and the body statically.
heading: Convert Python http.client to a cURL command
eyebrow: Standard library parser
lede: Read the standard library's own HTTP client, where the address is split between the connection and the request and has to be put back together.
language: python
client: httpclient
languageLabel: Python
clientLabel: http.client
order: 134
faqs:
  - question: Where does the URL come from?
    answer: From two places at once. HTTPSConnection carries the host and optional port, and the request call carries the path and query, so the reader rejoins them into one URL.
  - question: How is the scheme decided?
    answer: By the connection class. HTTPSConnection means https and HTTPConnection means http; neither is inferred from the host name.
  - question: Why does the command never carry -L?
    answer: http.client does not follow redirects at all. A 3xx has to be re-requested by hand, so the recovered request stops at the first response.
related:
  - python-to-curl
  - python-to-curl/urllib3
  - curl-to-python/httpclient
  - http-to-curl
---

## Two halves of one address

`http.client` is a connection object rather than a client. The authority
belongs to the constructor and the target belongs to the request:

Rejoining them is the first thing this reader does, because everything else on
the page depends on having a whole URL. An explicit port is kept, so a local
service on `localhost:8080` converts to a command that still points at it.

## Headers and the body

Headers are a plain mapping, which is also why `http.client` cannot send the
same field twice. The body is the third positional argument, and it may be a
string, a `bytes` literal, or a value built with `.encode("utf-8")`.

A multipart message assembled by hand with `b"".join([...])` is folded back
into a single payload and, when the declared content type carries a boundary,
split into its fields.

## Nothing is executed

The reader walks the source. A value that only exists at run time is reported
as an unresolved expression, with its text quoted back, rather than filled in.
