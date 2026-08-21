---
slug: curl-to-powershell/restmethod
parent: curl-to-powershell
title: cURL to Invoke-RestMethod Converter | CurlToCode
description: Convert cURL to PowerShell Invoke-RestMethod with headers, exact bodies, custom methods, streamed files, multipart forms, and an explicit MaximumRedirection.
heading: Convert cURL to Invoke-RestMethod
eyebrow: PowerShell API cmdlet
lede: Generate Invoke-RestMethod calls that return a deserialized object, with the redirect budget and content type written out rather than left to the default.
language: powershell
client: restmethod
languageLabel: PowerShell
clientLabel: Invoke-RestMethod
order: 1051
faqs:
  - question: When is CustomMethod used instead of Method?
    answer: The Method parameter only accepts the verbs in the WebRequestMethod enumeration. Anything outside it, such as a WebDAV verb, is emitted through CustomMethod instead.
  - question: Why is MaximumRedirection always written out?
    answer: PowerShell follows redirects by default and cURL does not without -L. Emitting either zero or a finite budget makes the policy explicit instead of inherited.
  - question: Why is basic auth sent as a header rather than a credential?
    answer: Building a PSCredential inline needs ConvertTo-SecureString and an AllowUnencryptedAuthentication caveat over plain HTTP. The header is shorter and is what cURL sends.
related:
  - curl-to-powershell
  - curl-to-powershell/webrequest
  - powershell-to-curl/restmethod
  - curl-to-httpie
---

## What Invoke-RestMethod returns

The cmdlet deserializes a JSON or XML response into PowerShell objects, which is
why it is the usual choice for API work. The generated example assigns the
result to `$response` and prints it directly.

If you need the status code, the response headers, or the raw bytes, use
[Invoke-WebRequest](/curl-to-powershell/webrequest) instead. The request
parameters are identical between the two.

## Method, headers, and content type

`-Method` is used for the verbs PowerShell models as an enumeration, and
`-CustomMethod` for everything else. Headers become a hashtable, which means a
repeated header name cannot be represented and is reported rather than dropped.

`-ContentType` and a `Content-Type` entry inside `-Headers` are two ways of
setting the same field, and supplying both is an error in Windows PowerShell.
The dedicated parameter wins, and the header entry is removed.

## Bodies

A textual body becomes a single-quoted `$body` variable. PowerShell's
single-quoted strings are literal, so there is no interpolation to escape and a
value containing `$` survives untouched.

A `--data-binary @file` body is streamed with `-InFile` rather than read into
a string. Multipart input becomes a `-Form` hashtable with `Get-Item` values.

Two multipart limitations are reported rather than approximated: `-Form`
derives each part's content type from the file itself, so a type declared in the
command cannot be honoured, and a hashtable cannot carry the same field name
twice.
