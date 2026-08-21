---
direction: code-to-curl
slug: powershell-to-curl
title: PowerShell to cURL Converter | CurlToCode
description: Convert static Invoke-RestMethod and Invoke-WebRequest calls to cURL locally, recovering URI, method, headers, authentication, body, forms, and redirects.
heading: Convert PowerShell to cURL
eyebrow: Static web-cmdlet parsing
lede: Parse literal PowerShell web requests and splatted parameter maps without invoking a cmdlet, expanding secrets, reading files, or contacting the URI.
language: powershell
client: restmethod
languageLabel: PowerShell
clientLabel: Invoke-RestMethod
order: 215
faqs:
  - question: Are splatted PowerShell parameters supported?
    answer: Yes. Static hashtables assigned to a variable and passed with @name can be resolved for supported literal keys and values. Runtime expressions remain unresolved.
  - question: Does the parser run PowerShell expressions?
    answer: No. It never starts PowerShell, evaluates a subexpression, reads an environment variable, resolves a credential object, or invokes a command. Dynamic values produce a limitation.
  - question: Are both web cmdlets recognized?
    answer: Yes. Invoke-RestMethod and Invoke-WebRequest share the same static request parameter parser and are reported with their detected client labels.
related:
  - powershell-to-curl/restmethod
  - powershell-to-curl/webrequest
  - curl-to-powershell
  - httpie-to-curl
---

## Direct calls and splatting

PowerShell commonly expresses a request either as one cmdlet invocation or as a
hashtable splatted into that invocation. The parser reads both static shapes and
normalizes URI, method, headers, credentials, body, form, content type, and
maximum redirection.

It does not evaluate PowerShell. Variable interpolation, subexpressions,
credential prompts, command output, and environment lookups are not resolved.

## Request parameters to cURL

Literal header hashtables become ordered cURL `-H` arguments, body content maps
to the appropriate data option, and a redirect allowance maps to `-L` when its
intent is known. File references remain paths instead of being opened.

The two cmdlets have different response models but describe requests through the
same core parameters, so both feed the same normalized request representation.

## Sensitive input stays local

PowerShell snippets often contain bearer tokens, cookies, or basic credentials.
Parsing stays in the browser and never runs the request or sends raw input to a
conversion service.
