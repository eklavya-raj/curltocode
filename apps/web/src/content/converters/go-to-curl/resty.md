---
direction: code-to-curl
slug: go-to-curl/resty
parent: go-to-curl
title: Go Resty to cURL Command Converter | CurlToCode
description: Convert Resty request chains back into a cURL command, reading Execute calls, headers, bodies, ordered multipart form data, bearer tokens, and redirect policy.
heading: Convert Go Resty to a cURL command
eyebrow: Resty parser
lede: Read a Resty request chain and recover the cURL command it stands for, resolving the calls that configure it without building a client or sending a request.
language: go
client: resty
languageLabel: Go
clientLabel: Resty
order: 152
faqs:
  - question: Which Resty call shapes are supported?
    answer: A request executed through Execute with an explicit method and URL, and the named methods Get, Head, Post, Put, Patch, Delete, and Options taking a URL.
  - question: How are multipart fields read?
    answer: SetMultipartOrderedFormData and SetMultipartFormData are collected in call order, with the single-element slice each takes unwrapped to its value, so field order is preserved.
  - question: What does SetAuthToken become?
    answer: A bearer token, which the generated command carries as an Authorization header. SetBasicAuth supplies a username and password pair instead.
related:
  - go-to-curl/nethttp
  - go-to-curl
  - curl-to-go/resty
  - php-to-curl/guzzle
---

## Reading a Resty chain

A Resty request is configured through method calls on a request value, so the
parser reads them in order rather than looking for one expression. `SetHeader`
replaces a header while `Header.Add` appends, which is what preserves a repeated
name, and both are read accordingly.

`SetBody` supplies the payload. Its representation follows the declared content
type: a JSON media type yields a JSON body, a urlencoded type yields form fields,
and an opaque type yields bytes.

## Authentication and multipart

`SetBasicAuth` supplies a username and password, and `SetAuthToken` supplies a
bearer token that becomes an Authorization header in the generated command.

Ordered multipart form data is collected in call order. Each setter takes its
value in a single-element slice, which is unwrapped so the resulting part carries
the value itself.

## Redirect policy and unresolved values

Resty follows redirects by default. The generated command omits the redirect flag
only when the client installs `resty.NoRedirectPolicy()`.

A URL or header built at run time, or a value returned by a function call, is
reported with its expression rather than replaced by an assumed value.
