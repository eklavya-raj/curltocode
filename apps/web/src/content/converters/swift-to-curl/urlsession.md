---
direction: code-to-curl
slug: swift-to-curl/urlsession
parent: swift-to-curl
title: URLSession to cURL Command Converter | CurlToCode
description: Convert Swift URLRequest and URLSession code to a cURL command, reading httpMethod, setValue headers, httpBody, and a hand-written multipart Data buffer.
heading: Convert URLSession to a cURL command
eyebrow: Foundation parser
lede: Read a URLRequest configured through its properties and recover the request, including a form assembled byte by byte.
language: swift
client: urlsession
languageLabel: Swift
clientLabel: URLSession
order: 1951
faqs:
  - question: Which parts of a URLRequest are read?
    answer: The URL from the initializer, httpMethod and httpBody from property assignments, and every setValue or addValue call that sets a header field.
  - question: How is a multipart form recovered?
    answer: URLSession has no multipart encoder, so code appends the message to a Data buffer. Those appends are joined and split back into fields using the declared boundary.
  - question: How does the converter know a request declines redirects?
    answer: By the task delegate. Refusing a 3xx needs a URLSessionTaskDelegate implementing willPerformHTTPRedirection, which is unmistakable in the source.
related:
  - swift-to-curl
  - swift-to-curl/alamofire
  - curl-to-swift/urlsession
  - http-to-curl
---

## A value, configured in place

`URLRequest` is a struct. Code creates it from a URL and then assigns to its
properties, so the request is spread across several statements rather than
built by a chain. The reader follows the assignments and the header calls and
puts them back together.

`setValue(_:forHTTPHeaderField:)` names the value first and the field second,
which is the reverse of nearly every other client here. Getting that backwards
would swap every header name with its value, so the label is what decides.

## Bodies

`httpBody` takes `Data`, and `Data("text".utf8)` is how a string becomes one.
Both are read through to the string.

## Forms written by hand

Because Foundation encodes no multipart form, the message is appended to a
buffer one chunk at a time. The reader joins those appends and, when the
declared content type carries a boundary, splits the result back into fields —
so a form written the long way still converts to `-F` options.
