---
direction: code-to-curl
slug: powershell-to-curl/webrequest
parent: powershell-to-curl
title: Invoke-WebRequest to cURL Converter | CurlToCode
description: Convert static PowerShell Invoke-WebRequest requests to cURL locally, reading literal methods, URLs, headers, authentication, bodies, forms, and redirects.
heading: Convert Invoke-WebRequest to cURL
eyebrow: PowerShell web response requests
lede: Turn the request parameters for Invoke-WebRequest into cURL without creating its response object, parsing HTML, or sending the request.
language: powershell
client: webrequest
languageLabel: PowerShell
clientLabel: Invoke-WebRequest
order: 217
faqs:
  - question: Are Invoke-WebRequest response properties converted?
    answer: No. StatusCode, Headers, Links, RawContent, and parsed HTML are response-time values, not request details. The static parser focuses only on the cmdlet invocation.
  - question: Is the short alias iwr supported?
    answer: The parser prioritizes the explicit cmdlet name because aliases can be changed or shadowed in a PowerShell session. Use Invoke-WebRequest for an unambiguous static conversion.
  - question: Does conversion perform a web request?
    answer: Never. The code is parsed as text locally, and URL, headers, body, cookies, and credentials are not transmitted.
related:
  - powershell-to-curl
  - powershell-to-curl/restmethod
  - curl-to-powershell
  - wget-to-curl
---

## Request parameters, not response parsing

Invoke-WebRequest returns a web response object and may expose parsed document
details. None of those exist until after execution, so they are deliberately
outside conversion. Literal request parameters use the same safe static parser
as Invoke-RestMethod.

The parser supports direct parameters and static splatting, then normalizes the
method, URI, headers, authentication, content, forms, and redirect allowance.

## No PowerShell host required

Conversion never starts a PowerShell process or relies on session aliases,
profiles, modules, variables, or credentials. An expression that needs that
runtime is reported as dynamic rather than assigned a guessed value.

The final cURL command is generated with shell-safe literals and no represented
network request is sent.
