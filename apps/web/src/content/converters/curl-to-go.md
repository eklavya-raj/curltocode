---
slug: curl-to-go
title: cURL to Go Converter – net/http & Resty v3 | CurlToCode
description: Convert cURL to Go net/http or Resty v3 code locally. Preserve JSON, forms, multipart files, duplicate headers, cookies, auth, and redirects.
heading: Convert cURL to Go
eyebrow: Go HTTP clients
lede: Generate standard-library net/http or concise Resty v3 code while keeping methods, queries, headers, cookies, authentication, and bodies intact.
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
    answer: net/http output uses only the standard library. Resty output imports resty.dev/v3 and includes the matching go get command, trading one dependency for a more concise request API and middleware support.
related:
  - curl-to-go/resty
  - curl-to-rust
  - curl-to-java
  - curl-to-python
  - go-to-curl
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

Choose Resty when the application already uses its request middleware, retries,
or response helpers. That generator still passes raw strings rather than asking
Resty to marshal JSON, and reaches the underlying header map to retain duplicate
values.

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
