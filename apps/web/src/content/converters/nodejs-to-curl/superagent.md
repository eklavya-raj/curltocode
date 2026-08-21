---
direction: code-to-curl
slug: nodejs-to-curl/superagent
parent: nodejs-to-curl
title: SuperAgent to cURL Converter | CurlToCode
description: Convert a SuperAgent chain into a cURL command, reading set, send, field, attach, auth, query, and redirects steps without executing the request.
heading: Convert SuperAgent to a cURL command
eyebrow: SuperAgent parser
lede: Follow a SuperAgent chain step by step and recover the request it builds, attachments and credentials included.
language: nodejs
client: superagent
languageLabel: Node.js
clientLabel: SuperAgent
order: 1155
faqs:
  - question: Which chain steps are understood?
    answer: set, type, auth, redirects, query, send, field, and attach. ok, timeout, retry, and the response helpers are recognised and skipped because they change nothing that is sent.
  - question: How is a file attachment read?
    answer: attach takes a name and a path, plus an options object that may name the filename and content type. All of it becomes a multipart file part in the command.
  - question: What does redirects zero mean?
    answer: It disables redirect following, which becomes a command without -L. Any positive count becomes one with -L, since cURL has no budget of its own to express.
related:
  - nodejs-to-curl
  - nodejs-to-curl/axios
  - curl-to-nodejs/superagent
  - ruby-to-curl/faraday
---

## A chain, read outermost first

SuperAgent builds a request by returning itself from every step, so the whole
call is one expression. The reader flattens it into the base call and the steps
applied to it, then maps each step onto a request field.

The base is either `superagent("PATCH", url)`, which takes the method as data,
or a per-verb helper such as `superagent.post(url)`. `del` is included,
because `delete` is a reserved word.

## Forms and attachments

`field` adds a text part and `attach` adds a file part. Both keep their order,
so a form with a repeated field name converts without losing either value.

## Steps that are skipped on purpose

`.ok(() => true)` appears in most generated SuperAgent code, and it exists to
stop the library throwing on a non-2xx response. It has no effect on the
request, so it is recognised and dropped rather than reported as unsupported.
