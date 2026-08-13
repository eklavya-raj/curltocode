---
slug: curl-to-php/curl
parent: curl-to-php
title: cURL to PHP cURL Converter | CurlToCode
description: Convert cURL commands to PHP ext-curl code using curl_setopt_array, with explicit redirect handling, repeated headers, CURLFile uploads, and no Composer.
heading: Convert cURL to PHP cURL
eyebrow: PHP ext-curl
lede: Generate PHP that uses the same libcurl your command already speaks to, through the bundled cURL extension with no Composer package required.
language: php
client: curl
languageLabel: PHP
clientLabel: cURL extension
order: 52
faqs:
  - question: Do I need Composer or any package for this?
    answer: No. The output uses ext-curl, the cURL extension bundled with virtually every PHP installation. There is no autoloader, no vendor directory, and no dependency to install, which makes this the right target for a single script, a legacy codebase, or anywhere you cannot add packages.
  - question: Why curl_setopt_array rather than repeated curl_setopt calls?
    answer: One array shows the whole request in a single readable block and is applied in one call. Repeated curl_setopt lines produce identical behaviour but scatter the configuration across the file, which is harder to review against the original command.
  - question: When should I use Guzzle instead?
    answer: Guzzle is the better choice in an application that already uses Composer and PSR-7, where you want middleware, connection reuse, or testable request mocking. The cURL extension is better for scripts, minimal environments, and anywhere the closest possible mapping to the original command matters.
related:
  - curl-to-php
  - curl-to-php/guzzle
  - curl-to-python/requests
---

## The closest possible mapping

This target is unusual: PHP's cURL extension is a binding over libcurl, the same
library the command-line `curl` uses. The translation is close to
option-for-option, so `-H` becomes `CURLOPT_HTTPHEADER`, `-X` becomes
`CURLOPT_CUSTOMREQUEST`, and `-d` becomes `CURLOPT_POSTFIELDS`. Less is being
reinterpreted here than in any other target.

Options are applied in one `curl_setopt_array` call, so the whole request reads
as a single block that you can compare against the original command line.

## Settings the generator always states

`CURLOPT_RETURNTRANSFER => true` makes `curl_exec` return the body as a string
instead of printing it straight to output, which is almost never what a script
wants.

`CURLOPT_FOLLOWLOCATION => false` matches plain cURL, which does not follow
redirects without `-L`. It is written out rather than relied on as a default so
the intent is visible in review, and it flips to `true` when your command has
`-L`.

## Headers, bodies, and file uploads

`CURLOPT_HTTPHEADER` takes a flat array of `Name: value` strings, so repeated
header names are preserved in order — PHP arrays are not a constraint here the
way an object literal is in JavaScript.

Bodies map by shape. JSON and raw payloads pass through as strings with the
content type set explicitly. Multipart uploads become an array, with file parts
wrapped in `CURLFile` carrying the posted filename and media type. Because PHP
runs server-side, `-F 'file=@avatar.png'` reads the file directly rather than
being rejected the way it is in the browser targets.

## Things to know

**Always check `curl_error`.** The generated code captures it. `curl_exec`
returns `false` on failure, and `false` is easy to mistake for an empty
response if you skip the check.

**Close the handle.** `curl_close` is emitted for you. Under PHP 8 handles are
objects that get collected, but closing explicitly is still the clearer habit in
a long-running script.

**Requires ext-curl.** It ships with nearly every PHP installation and is
usually enabled by default. If it is missing, `curl_init` will be undefined —
enable the extension, or use the [Guzzle target](/curl-to-php/guzzle), which can
fall back to PHP streams.
