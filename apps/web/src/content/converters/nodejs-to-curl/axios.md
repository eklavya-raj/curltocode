---
direction: code-to-curl
slug: nodejs-to-curl/axios
parent: nodejs-to-curl
title: Node.js Axios to cURL Converter | CurlToCode
description: Convert Node.js Axios requests to a cURL command, reading the config object, instances created with axios.create, params, auth, and the maxRedirects setting.
heading: Convert Node.js Axios to a cURL command
eyebrow: Axios parser
lede: Read an Axios call, including one made through an instance with its own base URL and headers, and recover the request it sends.
language: nodejs
client: axios
languageLabel: Node.js
clientLabel: Axios
order: 1152
faqs:
  - question: Are axios.create instances supported?
    answer: Yes. A baseURL is resolved against the call's path, and instance headers, auth, and params are merged with the call's own, with the call taking precedence.
  - question: How is the redirect policy read?
    answer: Axios counts redirects rather than switching them. maxRedirects set to zero becomes a command without -L; any positive budget becomes one with it.
  - question: What happens to the params option?
    answer: It is appended to the URL as query parameters, in the order written, which is where cURL would have carried them.
related:
  - nodejs-to-curl
  - nodejs-to-curl/got
  - curl-to-nodejs/axios
  - javascript-to-curl/axios
---

## One config object

Every Axios shape ends in the same configuration: `axios(config)`,
`axios.post(url, data, config)`, and `instance.get(url, config)` are read into
one object before anything else happens. That is why the per-verb shorthands
need no separate handling.

## Instances

Production code rarely calls the bare `axios` export. An instance built with
`axios.create({ baseURL, headers })` is followed to the call that uses it, and
its configuration is merged underneath the call's own. A header set in both
places resolves to the call's value, which is what Axios does at run time.

## Bodies

`data` is read as a string, a plain object serialized to JSON, a
`URLSearchParams`, or a `Buffer.from(...)` for inline binary. A JSON object
gains the `application/json` content type Axios would have set for it.
