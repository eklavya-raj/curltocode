---
direction: code-to-curl
slug: java-to-curl
title: Java to cURL – HttpClient, OkHttp & Apache | CurlToCode
description: Convert static Java requests to cURL locally, reading java.net.http HttpClient, OkHttp, and Apache HttpClient 5 builders including headers, bodies, and auth.
heading: Convert Java to cURL
eyebrow: Java HTTP parser
lede: Turn a Java request builder into a conventional cURL command, without compiling the class or sending the request it describes.
language: java
client: httpclient
languageLabel: Java
clientLabel: HttpClient
order: 160
faqs:
  - question: Which Java HTTP clients can be converted?
    answer: The JDK's java.net.http.HttpClient, OkHttp's Request.Builder, and Apache HttpClient 5, including its classic request classes and MultipartEntityBuilder.
  - question: Does CurlToCode run the code to work out the request?
    answer: No. Conversion is entirely static. Imports, helper methods, environment access, and the represented HTTP request are never executed, so nothing reaches a server.
  - question: What happens to a value the parser cannot resolve?
    answer: It is reported with the expression responsible rather than replaced by a guess. A URL from a helper call or a header built at run time produces a named limitation instead of an invented command.
related:
  - java-to-curl/httpclient
  - java-to-curl/okhttp
  - java-to-curl/apache
  - java-to-curl/httpurlconnection
  - curl-to-java
---

## Reading a builder chain

Java expresses a request as a chain of calls, so the parser reads them in order
and folds them together rather than looking for a single expression. Literals,
values assigned once, and static string concatenation are resolved; anything
else is reported.

Header handling distinguishes an appending setter from a replacing one, because only the first preserves a repeated header name. Bodies are read through their publishers and entities, and the representation follows the declared content type.

## What cannot be resolved safely

A URL returned by a helper, a header computed at run time, or a value read from
configuration cannot be known without executing the program. Each is reported
with the expression that caused it, which is more useful than a command that
looks complete but is wrong.
