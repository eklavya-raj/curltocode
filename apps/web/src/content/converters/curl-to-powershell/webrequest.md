---
slug: curl-to-powershell/webrequest
parent: curl-to-powershell
title: cURL to Invoke-WebRequest Converter | CurlToCode
description: Convert cURL to PowerShell Invoke-WebRequest with the full response object, headers, exact bodies, custom methods, form uploads, and explicit redirect limits.
heading: Convert cURL to Invoke-WebRequest
eyebrow: PowerShell response cmdlet
lede: Generate Invoke-WebRequest calls for when the status code, the response headers, or the raw content matter as much as the payload itself.
language: powershell
client: webrequest
languageLabel: PowerShell
clientLabel: Invoke-WebRequest
order: 1052
faqs:
  - question: How does this differ from Invoke-RestMethod?
    answer: The request parameters are identical. Invoke-WebRequest returns a response object carrying the status code, headers, and raw content, so the example prints its Content.
  - question: Why can a repeated request header not be converted?
    answer: The Headers parameter takes a hashtable, which cannot hold the same key twice. The converter reports the limitation rather than dropping one of the values.
  - question: What happens to a declared multipart part media type?
    answer: The Form parameter derives each part's content type from the file on disk, so a type declared in the cURL command is refused instead of being replaced by a guess.
related:
  - curl-to-powershell
  - curl-to-powershell/restmethod
  - powershell-to-curl/webrequest
  - curl-to-wget
---

## The whole response, not just the payload

`Invoke-WebRequest` returns a response object with `StatusCode`,
`Headers`, `RawContent`, and `Content`. The generated example prints
`$response.Content`, which is the closest equivalent to what cURL writes to
standard output.

This is the cmdlet to pick when you are checking a status code, following a
`Location` header by hand, or scraping a page rather than calling a JSON API.

## Identical request construction

Everything before the response is shared with
[Invoke-RestMethod](/curl-to-powershell/restmethod): `-Uri`, `-Method` or
`-CustomMethod`, a `-Headers` hashtable, `-ContentType`, the body
parameter, and `-MaximumRedirection`.

The redirect budget is emitted on every request. Zero reproduces cURL's default
of not following, and a finite budget reproduces `-L` without allowing an
unbounded chain.

## Bodies and forms

Textual payloads are assigned to `$body` as a literal single-quoted string.
Inline binary data goes through `[System.Text.Encoding]::UTF8.GetBytes`, and a
file body is streamed with `-InFile`.

Multipart input becomes a `-Form` hashtable whose file values are `Get-Item`
calls. A repeated field name or a declared part media type is reported as a
limitation, because a hashtable cannot hold a duplicate key and `-Form` reads
the type from disk.
