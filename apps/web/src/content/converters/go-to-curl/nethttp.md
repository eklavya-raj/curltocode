---
direction: code-to-curl
slug: go-to-curl/nethttp
parent: go-to-curl
title: Go net/http to cURL Command | CurlToCode
description: Convert Go net/http requests back into a cURL command, reading NewRequest, header calls, cookies, multipart writers, and basic auth without running the code.
heading: Convert Go net/http to a cURL command
eyebrow: net/http parser
lede: Read Go that builds a request with net/http and recover the cURL command behind it, following the statements that configure it without compiling anything.
language: go
client: nethttp
languageLabel: Go
clientLabel: net/http
order: 151
faqs:
  - question: Which net/http entry points are supported?
    answer: http.NewRequest and http.NewRequestWithContext, plus the http.Get, http.Head, and http.Post helpers. The context form is read with its arguments shifted accordingly.
  - question: Does Header.Add differ from Header.Set in the output?
    answer: Yes. Add appends, so a repeated header name is preserved as separate entries, while Set replaces an existing value. That difference is meaningful on the wire and is kept.
  - question: How is a multipart body recovered?
    answer: Fields written through a multipart.Writer with WriteField are collected in order. The Content-Type set from FormDataContentType is skipped, because its boundary is generated at run time.
related:
  - go-to-curl/resty
  - go-to-curl
  - curl-to-go/nethttp
  - php-to-curl/curl
---

## Reading a request built across statements

Go rarely expresses a request in one expression. A typical program constructs it,
then adds headers, cookies, and credentials in later statements. The parser reads
every call in order and folds them together, so the configuration that follows
the constructor is not lost.

Variables assigned exactly once through `:=` or `=` are resolved, including when
a URL is built by concatenating a base constant with a path. A name assigned more
than once is left unresolved, because choosing a value would mean following the
program's control flow.

## Bodies, cookies, and credentials

A body wrapped in `strings.NewReader`, `bytes.NewBufferString`,
`bytes.NewBuffer`, or a `[]byte` conversion is read through to the payload it
carries. Its representation follows the declared content type rather than being
assumed.

`req.AddCookie` composite literals are read for their `Name` and `Value` fields,
and `req.SetBasicAuth` supplies basic credentials.

## Redirects and unresolved values

Go's client follows redirects by default, so the redirect flag appears unless the
program installs a `CheckRedirect` policy returning `http.ErrUseLastResponse`.

A URL from a helper call, a header value computed at run time, or a body read
from a file cannot be resolved statically and is reported with its expression.
