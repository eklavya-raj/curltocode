---
slug: curl-to-go/nethttp
parent: curl-to-go
title: cURL to Go net/http Converter | CurlToCode
description: Convert cURL commands to standard-library Go net/http code with explicit redirect control, repeated headers, multipart uploads, and no third-party modules.
heading: Convert cURL to Go net/http
eyebrow: Go standard library
lede: Generate complete, runnable Go programs using only the standard library, with redirect behaviour stated explicitly instead of inherited from the client default.
language: go
client: nethttp
languageLabel: Go
clientLabel: net/http
order: 42
faqs:
  - question: Does the generated Go code need any modules?
    answer: None. Everything comes from the standard library — net/http, strings, mime/multipart, net/textproto, and os as required. You can paste the output into a main.go and run it with go run immediately, without a go.mod that lists dependencies.
  - question: Why is there a CheckRedirect function in the client?
    answer: Go's http.Client follows up to ten redirects by default, while cURL follows none unless you pass -L. Returning http.ErrUseLastResponse from CheckRedirect stops that and hands back the redirect response itself, matching plain cURL. With -L the field is omitted so Go's default following applies.
  - question: How are repeated header names handled?
    answer: Faithfully. Go's http.Header is a map of string slices, so req.Header.Add appends rather than replaces. Every value survives in order, which is not true of the targets whose clients take a flat object.
related:
  - curl-to-go
  - curl-to-go/resty
  - curl-to-rust/reqwest
---

## A complete program, no modules

The output is a full `package main` with its imports, ready to `go run` without
a `go.mod` listing anything. Only the standard library is used: `net/http` for
the request, `strings` for a body reader, and `mime/multipart` with
`net/textproto` and `os` when an upload is involved.

The import block is generated from what the request actually needs, so a simple
GET does not carry unused imports — which in Go is a compile error, not a
warning.

## Redirects are stated, not inherited

`http.Client` follows up to ten redirects by default. cURL follows none unless
you pass `-L`. Leaving that implicit is exactly the kind of silent behaviour
change this converter exists to avoid, so the generated client sets:

```
CheckRedirect: func(req *http.Request, via []*http.Request) error {
    return http.ErrUseLastResponse
}
```

That returns the redirect response itself rather than chasing it. When your
command has `-L`, the field is omitted and Go's default following takes over.

## Headers, bodies, and uploads

`http.Header` is a `map[string][]string`, so `req.Header.Add` appends instead of
replacing. Repeated header names survive in full, in order — something the
object-based clients in other languages cannot manage.

Bodies are wrapped in `strings.NewReader`, keeping JSON and form payloads
readable in the source rather than reducing them to an opaque blob. Multipart
uploads build a `multipart.Writer` over a `bytes.Buffer`, with `os.Open` for
file parts and `textproto.MIMEHeader` where a part declares its own content
type, so the posted filename and media type are preserved.

## Things to know

**Errors are checked, not swallowed.** The generated code follows the standard
`if err != nil` pattern throughout. It is verbose, and it is what idiomatic Go
looks like.

**The response body is closed.** `defer resp.Body.Close()` is always emitted.
Dropping it leaks connections from the pool, so keep it when adapting the code.

**Consider a client with a timeout.** `http.Client{}` has no timeout at all,
which is a well-known Go footgun in production. Set the `Timeout` field once you
move the snippet into a real service. If you would rather have that and retries
handled for you, the [Resty target](/curl-to-go/resty) covers both.
