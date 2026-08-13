---
direction: code-to-curl
slug: typescript-to-curl/axios
parent: typescript-to-curl
title: TypeScript Axios to cURL Converter | CurlToCode
description: Convert typed Axios requests and static AxiosRequestConfig values to cURL locally, preserving methods, params, headers, JSON, auth, and redirects.
heading: Convert TypeScript Axios to cURL
eyebrow: Typed Axios parser
lede: Parse TypeScript Axios helpers and request configurations into a conventional cURL command without executing imports, interceptors, or application code.
language: typescript
client: axios
languageLabel: TypeScript
clientLabel: Axios
order: 122
faqs:
  - question: Are AxiosRequestConfig annotations supported?
    answer: Static configuration objects wrapped in supported TypeScript annotations or satisfies expressions can be read. The annotation itself is not treated as request data.
  - question: Can the converter apply an Axios interceptor?
    answer: No. Interceptors are executable application behavior and may alter any request field. Values added by an interceptor must be written into the static snippet before conversion.
  - question: What happens to Axios params and auth fields?
    answer: Static params become URL query parameters and a static auth object becomes basic authentication. Dynamic members produce a clear unresolved-expression result.
related:
  - typescript-to-curl/fetch
  - typescript-to-curl
  - javascript-to-curl/axios
  - curl-to-typescript/axios
---

## Typed Axios configuration

Axios configuration often carries an `AxiosRequestConfig` annotation or a
`satisfies AxiosRequestConfig` check. CurlToCode unwraps supported TypeScript
syntax and reads the static `url`, `method`, `params`, `headers`, `data`, `auth`,
and redirect-related values represented by the request.

Convenience calls such as `axios.get` and `axios.post` are also supported. Their
argument positions determine the method and distinguish request data from the
remaining configuration.

## Query data, JSON, and authentication

Static params are appended as query parameters, preserving repeated pairs when
the source representation allows them. Object data is represented as JSON for
supported Axios calls. A literal auth object maps to cURL basic authentication,
while an Authorization header remains an explicit header.

The result uses the shared cURL generator, so TypeScript-specific syntax never
leaks into shell escaping or HTTP normalization.

## Runtime Axios behavior

Axios instances, interceptors, custom adapters, and transforms can change a
request at execution time. A type declaration does not expose those changes.
Rather than omit them and claim a complete conversion, the parser reports
meaningful unsupported configuration and dynamic expressions.

For the most faithful result, paste a self-contained call after expanding any
known base URL or inherited headers into literal request values.
