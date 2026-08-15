---
direction: code-to-curl
slug: java-to-curl/apache
parent: java-to-curl
title: Apache HttpClient 5 to cURL Command | CurlToCode
description: Convert Apache HttpClient 5 requests back into a cURL command, reading classic request constructors, addHeader calls, entities, and MultipartEntityBuilder parts.
heading: Convert Apache HttpClient to a cURL command
eyebrow: Apache HttpClient parser
lede: Read an Apache HttpClient 5 request and recover the cURL command it stands for, without constructing a client or executing anything.
language: java
client: apache
languageLabel: Java
clientLabel: Apache HttpClient
order: 163
faqs:
  - question: Which Apache request forms are read?
    answer: HttpUriRequestBase with its method and URI constructor arguments, the verb-named classic requests such as HttpPost, and ClassicRequestBuilder chains.
  - question: How are multipart parts recovered?
    answer: MultipartEntityBuilder text parts added with addTextBody are collected in call order, so the generated command preserves both the field names and their sequence.
  - question: What happens when a value cannot be resolved?
    answer: It is reported with the expression responsible. The parser never executes the code, so a value that only exists at run time becomes a named limitation rather than an invented one.
related:
  - java-to-curl/httpclient
  - java-to-curl/okhttp
  - java-to-curl
  - curl-to-java/apache-httpclient
---

## Constructors rather than a builder

Apache's classic requests take the method and URI as constructor arguments. Both
`new HttpUriRequestBase("POST", URI.create(...))` and the verb-named forms such
as `new HttpPost(...)` are read, with the method taken from whichever supplies it.

`addHeader` appends a field, and `setEntity` supplies the body, read through the
entity wrapper to the payload it carries.

## Redirects

Apache follows redirects unless a RequestConfig disables them, so the redirect
flag is omitted only when `setRedirectsEnabled(false)` appears.
