---
slug: curl-to-wget
title: cURL to GNU Wget Converter | CurlToCode
description: Convert cURL to GNU Wget commands with methods, repeated headers, exact inline or file bodies, authentication, cookies, and explicit redirect limits.
heading: Convert cURL to Wget
eyebrow: GNU Wget request mode
lede: Generate shell-safe Wget commands for representable HTTP requests, with an explicit redirect budget and multipart limitations stated clearly.
language: wget
client: cli
languageLabel: Wget
clientLabel: command line
order: 107
faqs:
  - question: Why is max-redirect always present?
    answer: GNU Wget follows redirects by default while cURL does not without -L. A zero or finite budget makes the converted command match the original policy.
  - question: Can Wget create multipart form data?
    answer: GNU Wget can send one body string or file but has no multipart form encoder. Multipart cURL input returns a limitation instead of flattening fields into an invalid payload.
  - question: Are repeated headers preserved?
    answer: Yes. Each value receives its own --header option, which GNU Wget adds to the outgoing request without requiring a name-keyed map.
related:
  - curl-to-httpie
  - curl-to-powershell
  - curl-to-http
  - wget-to-curl
---

## Wget as an HTTP request client

Although Wget is best known as a downloader, GNU Wget can set arbitrary methods,
headers, credentials, cookies, and inline or file-backed bodies. The generated
command uses explicit flags and POSIX-shell quoting so request values stay
literal.

Repeated header names become repeated `--header` arguments. A file body uses
Wget's file option rather than embedding bytes into the command.

## Redirect policy and multipart limitation

`--max-redirect=0` matches cURL without `-L`; the follow form uses a finite
budget. This avoids Wget's normal follow behavior adding requests that were not
present in the source command.

Wget has no multipart encoder. Sending the fields with `--body-data` would not
produce boundaries or per-part metadata, so conversion stops with an actionable
message.

## Safe reverse conversion

The reverse parser understands the generated static flags and reconstructs a
cURL command without running Wget. Command substitutions and other dynamic shell
features cannot be resolved safely and are reported.
