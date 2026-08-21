---
slug: curl-to-swift
title: cURL to Swift – URLSession & Alamofire | CurlToCode
description: Convert cURL to Swift URLSession or Alamofire code locally, with exact bodies, authentication, redirects, multipart forms, headers, and file data.
heading: Convert cURL to Swift
eyebrow: Apple platform HTTP clients
lede: Generate Foundation-only URLSession code or Alamofire requests with redirect handling and upload semantics made explicit.
language: swift
client: urlsession
languageLabel: Swift
clientLabel: URLSession
order: 32
faqs:
  - question: Should I use URLSession or Alamofire?
    answer: URLSession is built into Foundation and sufficient for most requests. Alamofire adds a polished request pipeline, validation, adapters, event monitors, and convenient upload APIs when an application already depends on it.
  - question: Why is a redirect delegate generated for URLSession?
    answer: URLSession follows redirects by default and has no per-request boolean to disable them. A task delegate that returns nil from the redirect callback is the platform-supported way to match cURL without -L.
  - question: Can the Swift output use local file paths?
    answer: Yes. Foundation loads file data through a file URL, and Alamofire can upload a file URL directly. Conversion does not read the file or perform the represented request.
related:
  - curl-to-swift/urlsession
  - curl-to-swift/alamofire
  - curl-to-objectivec
  - curl-to-kotlin
---

## Foundation or Alamofire

URLSession is the zero-dependency platform API across Apple operating systems
and through corelibs Foundation on supported server platforms. Its generated
code starts with `URLRequest`, sets the exact method and headers, and awaits the
response data.

Alamofire wraps that stack with request validation, redirect handlers, and
purpose-built upload methods. It is a better target when the rest of an app
already uses Alamofire's session, adapters, or monitoring hooks.

## Redirect correctness requires code

Both APIs follow redirects by default, unlike cURL without `-L`. URLSession
needs a delegate that declines the proposed redirected request. Alamofire uses
its `.doNotFollow` redirector. A command with `-L` selects their follow path.

## Exact payloads and multipart data

Serialized bodies become UTF-8 `Data` without a JSON serialization round trip.
URLSession constructs multipart bytes with a deterministic boundary, while
Alamofire uses its native multipart upload builder and file URLs.

Both header collections treat names as unique or comma-folded, so meaningful
duplicate names are reported. This is safer than changing a protocol-specific
field merely to satisfy a convenient dictionary API.
