---
slug: curl-to-cfml
title: cURL to CFML cfhttp Converter | CurlToCode
description: Convert cURL to CFML cfhttp and cfhttpparam tags with repeated headers, exact bodies, authentication, multipart files, cookies, and redirects.
heading: Convert cURL to CFML
eyebrow: ColdFusion HTTP tags
lede: Generate readable cfhttp markup whose child parameters retain header order and distinguish body, form, and file values.
language: cfml
client: cfhttp
languageLabel: CFML
clientLabel: cfhttp
order: 102
faqs:
  - question: How are repeated headers represented in cfhttp?
    answer: Each value becomes its own cfhttpparam type header tag. Separate child tags preserve repeated names instead of forcing them into one struct entry.
  - question: Can cfhttp send every custom method?
    answer: The tag accepts a documented method set that varies across compatible engines. Methods outside the reliable surface return a limitation instead of source that may fail at runtime.
  - question: How do multipart files map to CFML?
    answer: Text parts use formField parameters and files use file parameters with their path and supported content type, allowing cfhttp to create the boundary.
related:
  - curl-to-php
  - curl-to-java
  - curl-to-csharp
  - curl-to-http
---

## HTTP as CFML tags

The output uses a `cfhttp` element for the URL, method, and redirect policy, then
adds one `cfhttpparam` child per header and body component. This keeps the
request readable in both Adobe ColdFusion and compatible CFML engines.

Repeated header names remain separate child tags. Unsupported methods are
reported because engine differences make speculative output unreliable.

## Body and form parameters

Serialized content uses a body parameter. Multipart text values become
`formField` parameters and file values become `file` parameters, leaving the
boundary to cfhttp. Credentials and cookies stay in request parameters or
headers according to their normalized meaning.

The `redirect` attribute mirrors `-L`; no represented URL or file is accessed
while conversion runs.
