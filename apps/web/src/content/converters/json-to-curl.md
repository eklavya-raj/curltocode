---
direction: code-to-curl
slug: json-to-curl
title: JSON Request to cURL Converter | CurlToCode
description: Convert CurlToCode normalized JSON request documents to cURL locally, retaining ordered headers and queries, cookies, auth, body kinds, files, and redirects.
heading: Convert JSON to cURL
eyebrow: Validated request documents
lede: Turn a structured normalized request into shell-safe cURL while preserving distinctions that ordinary JSON key-value objects lose.
language: json
client: request
languageLabel: JSON
clientLabel: request document
order: 214
faqs:
  - question: What JSON shape does this page accept?
    answer: It accepts CurlToCode's normalized request document with method, URL, ordered collections, optional structured authentication and body, and request options. An arbitrary object is not guessed into a request.
  - question: Why not accept any object containing a URL?
    answer: Generic objects do not define header ordering, duplicate values, body encoding, cookies, or redirect semantics. Guessing those details could produce a plausible but incorrect network command.
  - question: Does a file body cause the browser to read that path?
    answer: No. A validated file reference becomes a cURL @path expression. The converter does not have or request filesystem access to its content.
related:
  - curl-to-json
  - har-to-curl
  - postman-to-curl
  - http-to-curl
---

## A strict request schema

The JSON format mirrors CurlToCode's central HTTP model. Arrays retain duplicate
and ordered headers, query parameters, and cookies. Authentication and body
objects use discriminated kinds so their interpretation is not inferred from a
string.

The reverse parser validates that structure before generating cURL. A syntactic
JSON object that matches neither this schema, HAR, nor Postman receives a format
explanation instead of a best-effort request.

## Shell-safe output

Validated values are routed through the same cURL generator as every other
reverse parser. Methods, headers, body options, files, and `-L` are quoted for a
POSIX shell and emitted deterministically.

Parsing is static and local. No URL or file path in the document is opened, and
request content is not included in analytics.
