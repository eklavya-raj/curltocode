---
direction: code-to-curl
slug: swift-to-curl
title: Swift to cURL – URLSession & Alamofire | CurlToCode
description: Convert Swift HTTP code into a cURL command. Reads URLRequest with URLSession and Alamofire statically, including headers, bodies, forms, and redirect handling.
heading: Convert Swift to cURL
eyebrow: Swift HTTP parser
lede: Turn Swift request code into the cURL command it stands for, whether it was written against Foundation or against Alamofire.
language: swift
client: urlsession
languageLabel: Swift
clientLabel: URLSession
order: 195
faqs:
  - question: Which Swift HTTP clients are supported?
    answer: Foundation's URLRequest, as used with URLSession, and Alamofire's request and upload calls. Both end up as the same normalized request.
  - question: Is the Swift compiled or run?
    answer: No. The reader walks the source, so nothing is built, nothing runs, and the represented request is never sent.
  - question: How is a redirect-declining request recognised?
    answer: By its task delegate. URLSession needs a delegate to refuse a 3xx, and Alamofire uses a redirect handler; both are visible in the source.
related:
  - swift-to-curl/urlsession
  - swift-to-curl/alamofire
  - curl-to-swift
  - dart-to-curl
---

## Foundation and Alamofire

**[URLSession](/swift-to-curl/urlsession)** works on a `URLRequest` value:
properties for the method and the body, and
`setValue(_:forHTTPHeaderField:)` for the headers. It has no multipart
encoder, so a form is written into a `Data` buffer by hand.

**[Alamofire](/swift-to-curl/alamofire)** wraps the same `URLRequest` and adds
its own multipart builder and a redirect handler.

## Reading Swift

Swift's argument labels carry meaning — `forHTTPHeaderField:` names the header
while the value comes first — and its leading-dot enum members leave the type
unwritten. Both are handled, because both appear in the first line of almost
every real request.

## Nothing leaves the page

Conversion is static and runs in your browser. A value produced at run time is
reported as unresolved rather than guessed.
