---
slug: curl-to-perl
title: cURL to Perl LWP::UserAgent Converter | CurlToCode
description: Convert cURL to Perl LWP::UserAgent code with repeated headers, redirects, authentication, exact body bytes, multipart forms, cookies, and file uploads.
heading: Convert cURL to Perl
eyebrow: LWP request code
lede: Generate HTTP::Request and LWP::UserAgent source with an explicit redirect budget and append-only request headers.
language: perl
client: lwp
languageLabel: Perl
clientLabel: LWP::UserAgent
order: 95
faqs:
  - question: Can LWP preserve repeated headers?
    answer: Yes. The generated request calls push_header for each value, which appends rather than replacing the previous field under that name.
  - question: How are redirects controlled?
    answer: LWP::UserAgent receives max_redirect zero without -L and a finite normal budget when redirect following was requested.
  - question: What creates multipart bodies?
    answer: HTTP::Request::Common builds the form and boundary, including text fields and file parts. Raw requests continue to use HTTP::Request directly.
related:
  - curl-to-ruby
  - curl-to-php
  - curl-to-lua
  - curl-to-c
---

## LWP's explicit request objects

The output constructs an `HTTP::Request`, pushes ordered headers, assigns the
content, and sends it through `LWP::UserAgent`. A finite `max_redirect` value
states whether `-L` was present instead of relying on LWP's defaults.

`push_header` is important: unlike a hash assignment, it retains repeated field
names. Basic and bearer authentication are expressed without logging or
resolving any credentials during conversion.

## Forms, files, and response status

Raw bodies stay serialized bytes. File-backed data is read by the generated Perl
program. Multipart requests use `HTTP::Request::Common` to generate a matching
boundary and encode text and file values.

LWP returns an `HTTP::Response` for HTTP status errors, keeping a completed 500
response distinct from a network failure. The example prints decoded content.

Install the required module with `cpanm LWP::UserAgent`.
