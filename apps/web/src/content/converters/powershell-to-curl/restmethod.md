---
direction: code-to-curl
slug: powershell-to-curl/restmethod
parent: powershell-to-curl
title: Invoke-RestMethod to cURL Converter | CurlToCode
description: Convert static PowerShell Invoke-RestMethod calls and splatted parameters to cURL locally, preserving request methods, headers, auth, bodies, and redirects.
heading: Convert Invoke-RestMethod to cURL
eyebrow: PowerShell API request parsing
lede: Recover the HTTP request described by Invoke-RestMethod without deserializing a response, executing PowerShell, or making a network connection.
language: powershell
client: restmethod
languageLabel: PowerShell
clientLabel: Invoke-RestMethod
order: 216
faqs:
  - question: Does response JSON deserialization affect the conversion?
    answer: No. Invoke-RestMethod's response behavior happens after the request. The parser recovers only static request parameters and generates cURL from them.
  - question: Can a hashtable variable be resolved?
    answer: A static literal hashtable used for splatting or headers can be read. Values produced by functions, commands, environment variables, or other runtime expressions cannot be resolved without execution.
  - question: Is MaximumRedirection converted?
    answer: A literal zero means do not follow redirects, while a positive allowance represents redirect following and produces -L.
related:
  - powershell-to-curl
  - powershell-to-curl/webrequest
  - curl-to-powershell
  - httpie-to-curl
---

## API-oriented cmdlet input

Invoke-RestMethod automatically deserializes common response formats, but that
post-response convenience does not change the HTTP request. CurlToCode reads the
URI, method, headers, credential parameters, content type, body, form, and
redirect allowance only.

Direct named parameters and a literal splatted map are both supported. Static
PowerShell strings are decoded; executable expressions are not.

## Deterministic cURL output

The recovered request passes through the shared cURL generator, so quoting,
method selection, body flags, and authentication match reverse conversions from
other languages. The output is stable for the same static input.

Nothing invokes `Invoke-RestMethod`, and no response is fetched or deserialized.
