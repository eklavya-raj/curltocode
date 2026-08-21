---
slug: curl-to-powershell
title: cURL to PowerShell Converter | CurlToCode
description: Convert cURL to Invoke-RestMethod or Invoke-WebRequest with headers, exact bodies, authentication, redirects, multipart forms, cookies, and files.
heading: Convert cURL to PowerShell
eyebrow: Native PowerShell web cmdlets
lede: Generate PowerShell for API-shaped or response-shaped workflows with explicit redirect counts and version-aware body handling.
language: powershell
client: restmethod
languageLabel: PowerShell
clientLabel: Invoke-RestMethod
order: 105
faqs:
  - question: Should I use Invoke-RestMethod or Invoke-WebRequest?
    answer: Invoke-RestMethod deserializes common API response formats for convenient object use. Invoke-WebRequest returns a richer response object with status, headers, links, and raw content.
  - question: Why is MaximumRedirection always generated?
    answer: PowerShell follows redirects by default while cURL does not without -L. Writing zero or a finite normal budget makes the converted command's policy explicit.
  - question: Can the generated PowerShell be converted back to cURL?
    answer: Yes. The reverse parser reads static splatted parameter maps and direct cmdlet invocations for both supported commands without executing PowerShell.
related:
  - curl-to-httpie
  - curl-to-wget
  - curl-to-ansible
  - curl-to-nodejs
---

## Two cmdlets, two response models

Both targets share the same request parameters: URI, method, headers, body,
credentials, forms, and redirect budget. The difference is the response.
`Invoke-RestMethod` turns JSON and XML into PowerShell objects, while
`Invoke-WebRequest` retains the web response wrapper.

The output uses a splatted hashtable, keeping a large request readable and easy
to edit.

## Redirects, headers, and multipart limits

`MaximumRedirection` is zero when cURL omitted `-L` and a finite budget when it
was present. Headers use a hashtable, so repeated names cannot be preserved.

PowerShell's `-Form` also uses a name-keyed structure and derives file content
types. Repeated multipart names or an explicit per-file type receive a precise
limitation instead of altered output.

## Static reverse conversion

Switch to Code → cURL to parse literal cmdlet parameters or a static splat. The
parser never invokes the command, expands credentials, or contacts the URI.
Dynamic expressions are reported rather than evaluated.
