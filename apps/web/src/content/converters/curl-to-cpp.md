---
slug: curl-to-cpp
title: cURL to C++ cpr Converter | CurlToCode
description: Convert cURL to modern C++ cpr request code with methods, headers, authentication, redirect options, raw bodies, multipart files, and clear limitations.
heading: Convert cURL to C++
eyebrow: Modern C++ over libcurl
lede: Generate readable cpr calls for C++ applications, using the library's payload and multipart types instead of exposing the C easy interface.
language: cpp
client: cpr
languageLabel: C++
clientLabel: cpr
order: 92
faqs:
  - question: Why use cpr instead of libcurl directly?
    answer: cpr wraps libcurl with RAII objects, strings, and concise request calls that fit modern C++. Direct libcurl exposes more protocol controls and preserves unusual cases such as repeated headers more faithfully.
  - question: Can cpr send custom HTTP methods?
    answer: The stable high-level API is built around named verb functions, so unsupported extension methods return a limitation rather than being translated into a different standard verb.
  - question: Why are repeated headers rejected?
    answer: cpr::Header is a case-insensitive map. Assigning the same name again replaces its earlier value, so the request would no longer match cURL.
related:
  - curl-to-c
  - curl-to-rust
  - curl-to-java/okhttp
  - curl-to-csharp/flurl
---

## A C++ wrapper over libcurl

cpr provides C++ value types and named request functions on top of libcurl. The
generated source builds a URL, header map, authentication, redirect option, and
body or multipart value before invoking the matching verb.

The abstraction is smaller than libcurl's full option surface. Custom methods
outside cpr's supported call set are reported rather than forced through a
plausible but unreliable workaround.

## Bodies and multipart

Raw serialized bodies use `cpr::Body`, preserving the input text. Multipart
fields use `cpr::Multipart`; file parts retain paths and the metadata the stable
API can express. cpr owns the boundary, so copied multipart content-type headers
do not override its encoder.

## Header limitation and installation

`cpr::Header` has one value per case-insensitive key. Duplicate request names
therefore produce an explicit error. Choose [C libcurl](/curl-to-c) when the
request depends on separate repeated fields.

Install cpr with `vcpkg install cpr`, or use the package flow already adopted by
the CMake project.
