---
slug: curl-to-javascript/jquery
parent: curl-to-javascript
title: cURL to jQuery AJAX Converter | CurlToCode
description: Convert cURL to a jQuery $.ajax request with exact raw bodies, FormData fields, headers, authentication, and explicit browser redirect limitations.
heading: Convert cURL to jQuery AJAX
eyebrow: Legacy browser request API
lede: Generate a jQuery AJAX call for established browser applications while keeping serialization and multipart behaviour explicit.
language: javascript
client: jquery
languageLabel: JavaScript
clientLabel: jQuery AJAX
order: 24
faqs:
  - question: Why is processData set to false?
    answer: jQuery otherwise transforms some data values into a query string. The cURL command already contains the serialized request body, so disabling processing prevents a second encoding pass from changing it.
  - question: Can jQuery control redirect following in a browser?
    answer: No. Browser networking follows redirects before JavaScript receives the response, and XMLHttpRequest exposes no equivalent to cURL's -L switch. The generated comment makes that unavoidable difference visible.
  - question: Why is contentType false for multipart output?
    answer: FormData must generate its own boundary and matching Content-Type header. Supplying a copied header would omit or mismatch the boundary and make the server unable to parse the parts.
related:
  - curl-to-javascript
  - curl-to-javascript/xhr
  - curl-to-javascript/fetch
  - curl-to-javascript/axios
---

## For existing jQuery applications

New browser code usually starts with Fetch, but many maintained applications
already route requests through jQuery's global AJAX hooks and conventions. This
target generates one `$.ajax` call without requiring a migration of the
surrounding application.

The method, URL, headers, and body are set directly. `processData: false` stops
jQuery from treating an already serialized body as data it should encode again.
For multipart data, `contentType: false` lets `FormData` provide the boundary.

## Browser limits remain browser limits

jQuery uses XMLHttpRequest underneath. It cannot set forbidden browser headers
such as `Cookie`, cannot open a local shell path, and cannot disable redirect
following. The generated code comments on the redirect mismatch, and file paths
produce a limitation explaining that a real `File` must come from user input.

Repeated header names are not safe either: a JavaScript object has one value per
key. The converter refuses the request rather than keeping only the final value.

## Response behaviour

jQuery separates success and failure statuses through its promise callbacks,
which differs from cURL's exit status defaults. The snippet returns the AJAX
promise so an existing application can attach the error handling it already
uses; the converter does not invent UI or retry policy around the request.
