---
direction: code-to-curl
slug: python-to-curl/urllib3
parent: python-to-curl
title: urllib3 to cURL Command Converter | CurlToCode
description: Convert urllib3 requests into a cURL command, reading headers including HTTPHeaderDict, the body, multipart fields, and the redirect switch without running the code.
heading: Convert urllib3 to a cURL command
eyebrow: urllib3 parser
lede: Read the transport underneath Requests, including the header container that lets it send the same field twice.
language: python
client: urllib3
languageLabel: Python
clientLabel: urllib3
order: 135
faqs:
  - question: Which call shapes are supported?
    answer: A PoolManager or connection pool assigned to a variable and then used, and urllib3's module-level request function. Both take the method and URL first.
  - question: How are duplicate headers recovered?
    answer: From HTTPHeaderDict. A dict literal cannot hold one name twice, so urllib3 offers a container populated by add calls, and those calls are read in order.
  - question: What does the fields option become?
    answer: A multipart body. Each entry is a name with either a value or a filename, data, and content-type tuple, and the tuples become file parts.
related:
  - python-to-curl
  - python-to-curl/requests
  - curl-to-python/urllib3
  - python-to-curl/httpclient
---

## The layer under Requests

urllib3 is what Requests uses to talk to a socket, and code reaches for it
directly when it needs something Requests smooths over. Its `request` takes
the method and the whole URL positionally, then names everything else.

## Headers that can repeat

`urllib3.HTTPHeaderDict()` exists because a Python dict cannot hold the same
key twice. Code populates it with `add` calls, and the reader follows those
calls in order, so two `X-Feature` headers come back as two headers rather
than as one.

## Bodies and forms

`body` may be a string, a `bytes` value, or an open file, and a file handle
becomes a file-backed body in the command rather than a blob of text.

`fields` is the multipart form. A field entry with `None` as its filename is
a text part; one that names a file is a file part, and a tuple that embeds the
file's bytes instead of its path is refused rather than approximated.

## Redirects

`redirect` defaults to true, so a request that says nothing about it converts
to a command with `-L`.
