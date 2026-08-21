---
direction: code-to-curl
slug: swift-to-curl/alamofire
parent: swift-to-curl
title: Alamofire to cURL Command Converter | CurlToCode
description: Convert Alamofire requests into a cURL command, reading AF.request and AF.upload, HTTPHeaders dictionaries, multipart form appends, and the redirect handler.
heading: Convert Alamofire to a cURL command
eyebrow: Alamofire parser
lede: Read an Alamofire call and recover the request, including a multipart form built in its closure.
language: swift
client: alamofire
languageLabel: Swift
clientLabel: Alamofire
order: 1952
faqs:
  - question: Which Alamofire calls are read?
    answer: AF.request, in both the URL and the URLRequest forms, and AF.upload with a multipartFormData closure. Both take the method as a leading-dot enum member.
  - question: How are the form's parts recovered?
    answer: From the append calls inside the multipartFormData closure. Each names its field with withName, and the order is kept so a repeated name survives.
  - question: What does redirect using doNotFollow convert to?
    answer: A command without -L. Alamofire follows redirects unless a handler says otherwise, so only that step changes the policy.
related:
  - swift-to-curl
  - swift-to-curl/urlsession
  - curl-to-swift/alamofire
  - nodejs-to-curl/superagent
---

## Two entry points

`AF.request` takes either a URL with a method and headers, or a fully built
`URLRequest`. Both are read: the first from its argument labels, the second
through the same [URLRequest reader](/swift-to-curl/urlsession) Foundation code
uses.

`AF.upload` is the multipart form. Its first argument is a closure, which no
static reader can evaluate, so the parts are taken from the `append` calls
inside it and the destination from the `to:` label that follows.

## HTTPHeaders is a dictionary

Alamofire's header type is initialized from a Swift dictionary literal, often
declared above the call. That binding is followed, so headers written apart
from the request still reach the converted command.

## Redirect handling

`.redirect(using: .doNotFollow)` is the opt-out. Without it Alamofire follows,
and the command carries `-L`.
