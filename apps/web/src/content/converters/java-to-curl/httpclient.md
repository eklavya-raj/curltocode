---
direction: code-to-curl
slug: java-to-curl/httpclient
parent: java-to-curl
title: Java HttpClient to cURL Command | CurlToCode
description: Convert java.net.http.HttpClient builders back into a cURL command, reading uri, method, header calls, body publishers, and the redirect policy statically.
heading: Convert Java HttpClient to a cURL command
eyebrow: JDK HttpClient parser
lede: Read a java.net.http request builder and recover the cURL command behind it, without compiling the class or sending the request.
language: java
client: httpclient
languageLabel: Java
clientLabel: HttpClient
order: 161
faqs:
  - question: Which builder calls are read?
    answer: uri and URI.create supply the URL, method supplies the verb and its body publisher, and header adds a field. Verb shorthands such as GET and POST are read the same way.
  - question: Why do some requests report an unsupported body?
    answer: The JDK client has no multipart body publisher, so the forward generator refuses multipart rather than emitting something lossy. There is correspondingly nothing to read back.
  - question: What happens when a value cannot be resolved?
    answer: It is reported with the expression responsible. The parser never executes the code, so a value that only exists at run time becomes a named limitation rather than an invented one.
related:
  - java-to-curl/okhttp
  - java-to-curl/apache
  - java-to-curl
  - curl-to-java/httpclient
---

## Builder calls that carry the request

`uri(URI.create(...))` supplies the URL and `method(...)` supplies both the verb
and its body publisher. A `BodyPublishers.ofString` payload is read through to
the text it carries, and its representation follows the declared content type.

`header(...)` appends a field, so a repeated header name survives as separate
entries rather than being collapsed.

## Redirects

The JDK client follows redirects only when its builder says so. A
`Redirect.NEVER` policy means the generated command carries no redirect flag,
which is also cURL's own default.
