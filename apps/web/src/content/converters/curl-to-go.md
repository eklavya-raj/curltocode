---
slug: curl-to-go
title: cURL to Go Converter – net/http | CurlToCode
description: Convert cURL commands to Go net/http code in your browser. Headers, JSON bodies, forms, multipart uploads, cookies, and basic auth are preserved exactly.
heading: Convert cURL to Go
eyebrow: Go standard library
lede: Generate net/http request code that keeps your method, query parameters, headers, cookies, authentication, and request body intact.
language: go
client: nethttp
languageLabel: Go
clientLabel: net/http
order: 40
faqs:
  - question: Does the generated Go code follow redirects?
    answer: Only when the original command used -L. Go's default client follows redirects automatically, so when -L is absent the generated code installs a custom http.Client whose CheckRedirect returns http.ErrUseLastResponse, matching cURL's default of not following them.
  - question: How are duplicate header names handled in Go?
    answer: They are preserved. The generated code calls req.Header.Add rather than req.Header.Set, so repeating a header name appends another value instead of replacing the previous one. This matches what cURL sends on the wire.
  - question: Do I need any third-party Go modules?
    answer: No. Every generated request uses only the standard library — net/http for the request, strings or bytes for the body, mime/multipart for uploads, and io for reading the response. There is nothing to add to go.mod.
related:
  - curl-to-rust
  - curl-to-java
  - curl-to-python
---

## How the Go output is structured

The generated program is a complete `main` package you can drop into a file and
run with `go run`. It builds the request with `http.NewRequest`, applies headers
and cookies, executes it, and prints the response body. Errors are surfaced with
`panic` so the example stays short; in real code you would return them instead.

Bodies are wrapped in a reader rather than passed as a string, because
`http.NewRequest` takes an `io.Reader`. A JSON or form body becomes
`strings.NewReader`, and a file body becomes an `os.Open` handle that the
request streams rather than loading into memory.

## Multipart uploads

Multipart requests are assembled with `mime/multipart` before the request is
created, because the writer generates the boundary that has to appear in the
`Content-Type` header. The generated code writes each text field with
`WriteField`, copies each file through `io.Copy`, closes the writer, and only
then sets `Content-Type` from `writer.FormDataContentType()`.

When a part declares its own media type, the code switches from
`CreateFormFile` to `CreatePart` with an explicit `textproto.MIMEHeader`.
`CreateFormFile` always writes `application/octet-stream`, so it cannot carry a
type such as `image/png` that cURL would have sent.

## Common conversion issues

**The boundary must not be set by hand.** If you copy a `Content-Type:
multipart/form-data; boundary=...` header out of a browser and pass it with
`-H`, the boundary will not match the one Go generates. The converter always
lets the multipart writer own that header for `-F` requests.

**Cookies are values, not a header string.** Go models cookies as
`http.Cookie` values added with `req.AddCookie`, so the generated code adds
each cookie individually instead of building one `Cookie` header. The bytes sent
are identical.

**A request body needs an explicit method.** `http.NewRequest` will happily
attach a body to a `GET`, but cURL and browser clients disagree about what that
means, so the converter rejects it rather than emitting code whose behaviour
depends on the server.
