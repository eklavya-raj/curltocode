---
slug: curl-to-postman
title: cURL to Postman Collection Converter | CurlToCode
description: Convert cURL to a Postman Collection v2.1 JSON document with ordered headers, auth, query data, exact bodies, multipart files, and redirect behavior.
heading: Convert cURL to Postman
eyebrow: Collection v2.1 request
lede: Wrap one normalized request in an importable Postman collection without sending it or inventing tests, environments, scripts, or responses.
language: postman
client: collection
languageLabel: Postman
clientLabel: collection v2.1
order: 111
faqs:
  - question: Is the generated JSON a complete Postman collection?
    answer: Yes. It includes the v2.1 schema metadata and one named request item. It deliberately omits invented environments, examples, tests, and scripts that were not present in the cURL command.
  - question: Can Postman collections be converted back to cURL?
    answer: Yes. The parser walks folders, lists nested requests, skips disabled headers, reads auth and body modes, and chooses the first request by default.
  - question: How is redirect behavior stored?
    answer: The request item uses protocolProfileBehavior followRedirects, which records whether the original cURL command contained -L.
related:
  - curl-to-har
  - curl-to-json
  - curl-to-http
  - postman-to-curl
---

## A minimal importable collection

The output follows Postman Collection v2.1 and contains one item with its method,
URL, ordered headers, auth, body, and protocol behavior. It is intentionally
minimal: no workspace, environment, examples, tests, or scripts are fabricated.

Raw bodies remain raw text. URL-encoded and multipart forms use their structured
collection modes, retaining ordered fields and file source paths.

## Nested collections in reverse

Real exports often place requests several folders deep. The reverse parser walks
that tree and lists each request with its display name. The basic converter uses
the first request deterministically, while library consumers may select an entry.

Disabled headers are ignored, structured basic authentication is recovered, and
the per-item redirect setting maps back to `-L`. Collection variables that need
runtime resolution are not invented.
