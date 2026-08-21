---
direction: code-to-curl
slug: csharp-to-curl/flurl
parent: csharp-to-curl
title: Flurl to cURL Command Converter | CurlToCode
description: Convert a Flurl chain into a cURL command, reading WithHeader, WithBasicAuth, the content object that carries the body, and the Redirects setting statically.
heading: Convert Flurl to a cURL command
eyebrow: Flurl parser
lede: Read a Flurl chain that hangs off a URL string and recover the request, media type included.
language: csharp
client: flurl
languageLabel: C#
clientLabel: Flurl
order: 173
faqs:
  - question: Where does the URL come from?
    answer: From the string the chain hangs off. Flurl's extension methods extend string, so the URL is the receiver of the chain rather than an argument to anything in it.
  - question: How is the content type recovered?
    answer: From the StringContent passed to SendAsync, which names the media type as its third argument. Flurl carries the payload and its type in one object.
  - question: What reads the redirect policy?
    answer: The WithSettings step. Redirects.Enabled set to false becomes a command without -L; Flurl follows by default otherwise.
related:
  - csharp-to-curl
  - csharp-to-curl/httpclient
  - curl-to-csharp/flurl
  - csharp-to-curl/restsharp
---

## A chain on a string

Flurl's appeal is that a URL literal is already a request builder. That makes
the URL the one part of the request the chain never names, so the reader takes
it from the first absolute URL literal in the source — which is exactly the
receiver the chain started from.

## Content objects

`SendAsync(HttpMethod.Patch, new StringContent(body, Encoding.UTF8, type))`
puts the payload and its media type in the same place. The reader takes both
from that constructor, which is why a JSON body converts with its content type
even though no `WithHeader` call mentions one.

## Multipart

`SendMultipartAsync` takes a builder lambda whose `AddString` calls name the
fields. Those are read in order, so a form with a repeated field name converts
without losing a value.

## Steps that change nothing

`AllowAnyHttpStatus` stops Flurl throwing on a non-2xx. It is recognised and
skipped, because cURL prints whatever came back regardless.
