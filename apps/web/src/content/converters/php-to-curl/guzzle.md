---
direction: code-to-curl
slug: php-to-curl/guzzle
parent: php-to-curl
title: Guzzle to cURL Command Converter | CurlToCode
description: Convert Guzzle client calls back into a cURL command, reading headers, json, form_params, multipart, query, auth, and allow_redirects options statically.
heading: Convert Guzzle to a cURL command
eyebrow: Guzzle parser
lede: Read a Guzzle request and recover the equivalent cURL command, resolving its options array without constructing a client or sending anything.
language: php
client: guzzle
languageLabel: PHP
clientLabel: Guzzle
order: 142
faqs:
  - question: Which Guzzle call shapes are supported?
    answer: The general request method with an explicit verb, and the named shorthands get, post, put, patch, delete, head, and options. Both take the same options array.
  - question: How do json and form_params differ in the output?
    answer: The json option serializes its value and sets a JSON content type, while form_params produces urlencoded fields. Each yields the matching cURL body flag and content type.
  - question: Why does a Guzzle request keep the redirect flag by default?
    answer: Guzzle follows redirects unless allow_redirects is set to false, which is the opposite of the cURL extension's default. The generated command reflects Guzzle's behaviour, not the extension's.
related:
  - php-to-curl/curl
  - php-to-curl
  - curl-to-php/guzzle
  - go-to-curl/resty
---

## The options array

`headers` accepts a name-to-value mapping. `query` is merged into the URL rather
than left separate, so the generated command carries a single complete URL.
`auth` supplies a username and password pair as basic credentials.

Body options are mutually exclusive and each implies its own representation.
`json` serializes a value and declares a JSON content type. `form_params`
produces urlencoded fields. `multipart` takes a list of parts, each with a name
and its contents. `body` is passed through as written and classified by whatever
content type the headers declare.

## Redirect behaviour differs from the extension

Guzzle follows redirects by default, so a converted request keeps the redirect
flag unless `allow_redirects` is explicitly false. PHP's cURL extension does the
reverse. Both are represented as written rather than normalized to one default.

## What cannot be resolved safely

A client built with a dynamic base URI, an options array assembled at run time,
or a value returned by a function call cannot be resolved without executing the
script. Each is reported with the expression that caused it.
