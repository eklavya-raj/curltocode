---
direction: code-to-curl
slug: go-to-curl
title: Go to cURL – net/http & Resty Converter | CurlToCode
description: Convert static Go requests to cURL locally, reading net/http and Resty calls including methods, headers, cookies, bodies, multipart fields, and auth.
heading: Convert Go to cURL
eyebrow: Go HTTP parser
lede: Turn Go that builds a net/http request or drives a Resty client into a conventional cURL command, without compiling the program or sending its request.
language: go
client: nethttp
languageLabel: Go
clientLabel: net/http
order: 150
faqs:
  - question: Which Go HTTP clients can be converted?
    answer: The parser reads net/http through http.NewRequest, http.NewRequestWithContext, and the http.Get, http.Head, and http.Post helpers, plus Resty request chains.
  - question: How does a request built across several statements get read?
    answer: Go accumulates a request over multiple statements, so the parser reads every call in order and folds them together, including header additions, cookies, and multipart writer fields.
  - question: Why does the generated command sometimes omit the redirect flag?
    answer: Go's client follows redirects by default. The flag is omitted only when the source opts out, through an ErrUseLastResponse policy for net/http or NoRedirectPolicy for Resty.
related:
  - go-to-curl/nethttp
  - go-to-curl/resty
  - curl-to-go
  - php-to-curl
  - java-to-curl
---

## net/http and Resty source

Select Go in the first menu, then choose the library the snippet uses. Go builds
a request across statements rather than in one expression, so the parser reads
the calls in order: the constructor, then header additions, cookies, credentials,
and body writes.

Header handling distinguishes `Header.Add` from `Header.Set`, because only the
first preserves a repeated header name. That distinction survives into the
generated command.

## Bodies, cookies, and multipart

A body wrapped in `strings.NewReader`, `bytes.NewBufferString`,
`bytes.NewBuffer`, or a `[]byte` conversion is read through the wrapper to the
payload it carries. Its representation is then decided by the declared content
type, so a JSON media type yields a JSON body and an opaque one yields bytes.

Cookies added through `req.AddCookie` are read from their composite literals,
and multipart fields written with a `multipart.Writer` are collected in order.
Resty's ordered form setters are read the same way.

## What cannot be resolved safely

A URL returned by a helper, a header built at run time, or a variable the
program reassigns cannot be known without executing the code. Each is reported
with the expression responsible, rather than being replaced by a guess.
