---
slug: curl-to-r
title: cURL to R – httr2 & httr Converter | CurlToCode
description: Convert cURL to R httr2 or httr code with exact bodies, authentication, headers, cookies, redirects, multipart fields, and local file uploads.
heading: Convert cURL to R
eyebrow: Current and legacy R HTTP
lede: Generate piped httr2 requests for new R code or familiar httr calls for existing analysis and automation projects.
language: r
client: httr2
languageLabel: R
clientLabel: httr2
order: 96
faqs:
  - question: Should new R projects use httr2 or httr?
    answer: httr2 is the current tidyverse HTTP client with a request object and composable req_* functions. httr remains supported and widely present in existing scripts and packages.
  - question: Why can repeated headers be a limitation?
    answer: Both high-level APIs collect headers by name, so separate same-name fields cannot be relied upon to reach the wire unchanged. The converter refuses those requests rather than guessing a join rule.
  - question: How are multipart files represented?
    answer: httr2 uses req_body_multipart with upload_file values, while httr uses upload_file in its body list with multipart encoding.
related:
  - curl-to-python
  - curl-to-julia
  - curl-to-matlab
  - curl-to-ruby
---

## httr2 for new code, httr for existing code

httr2 builds a request through a pipe: method, headers, authentication, body,
redirect policy, and performance are configured as named steps. It is easier to
inspect and extend than one call with many positional arguments.

httr remains common in packages and older scripts. Its generic `VERB` path can
express the original method while body helpers retain raw or multipart content.

## Body and upload fidelity

Both generators pass already serialized content as raw bytes or exact strings
instead of asking R to rebuild JSON. Multipart values use the libraries' native
upload wrappers so filenames and supported media types accompany file paths.

Header collections are name-keyed and cannot guarantee separate duplicate
lines. Such commands receive a limitation. Redirect behavior is set explicitly
from `-L` rather than inherited.

Install with `install.packages("httr2")` or `install.packages("httr")`.
