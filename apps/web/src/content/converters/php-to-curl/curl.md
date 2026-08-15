---
direction: code-to-curl
slug: php-to-curl/curl
parent: php-to-curl
title: PHP cURL Extension to cURL Command | CurlToCode
description: Convert PHP curl_setopt and curl_setopt_array configurations back into a cURL command, including headers, post fields, cookies, credentials, and redirects.
heading: Convert PHP cURL to a cURL command
eyebrow: cURL extension parser
lede: Read a PHP script that configures the cURL extension and recover the command it was generated from, without executing the script or contacting the URL it names.
language: php
client: curl
languageLabel: PHP
clientLabel: cURL extension
order: 141
faqs:
  - question: Are both curl_setopt forms supported?
    answer: Yes. A single curl_setopt_array with an options array and a sequence of individual curl_setopt calls are read the same way, and the two may be mixed in one script.
  - question: Why does an array of post fields produce -F rather than -d?
    answer: PHP sends a string CURLOPT_POSTFIELDS verbatim but sends an array as multipart/form-data. The option name does not say which, so the argument type decides, exactly as PHP does at run time.
  - question: What happens to CURLOPT_RETURNTRANSFER and similar options?
    answer: Options that control how the PHP process handles the response rather than what is sent on the wire have no effect on the generated command and are ignored.
related:
  - php-to-curl/guzzle
  - php-to-curl
  - curl-to-php/curl
  - go-to-curl/nethttp
---

## Options the parser reads

`CURLOPT_URL` supplies the URL and `CURLOPT_CUSTOMREQUEST` the method. Without an
explicit method, `CURLOPT_POST` or the presence of post fields implies POST, and
`CURLOPT_NOBODY` implies HEAD, which is the same order of precedence the
extension applies.

`CURLOPT_HTTPHEADER` carries a list of `Name: value` strings. `CURLOPT_COOKIE`,
`CURLOPT_USERAGENT`, and `CURLOPT_REFERER` each set a single header and are
folded in alongside them, so a cookie string becomes individual cookies in the
generated command.

## Bodies and credentials

A string `CURLOPT_POSTFIELDS` is read against the declared content type: JSON
yields a JSON body, a urlencoded type yields form fields, and an opaque type
yields bytes. An array switches the request to multipart, preserving field order.

`CURLOPT_USERPWD` becomes basic credentials. A value without a colon is read as a
username with an empty password, matching how the extension treats it.

## What cannot be resolved safely

Values built by calling a function, reading an environment variable, or
concatenating a variable the script reassigns are reported with the expression
responsible. Static concatenation and variables assigned once are resolved.
