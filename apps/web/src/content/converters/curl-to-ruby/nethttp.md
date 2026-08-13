---
slug: curl-to-ruby/nethttp
parent: curl-to-ruby
title: cURL to Ruby Net::HTTP Converter | CurlToCode
description: Convert cURL commands to Ruby Net::HTTP code from the standard library, with repeated headers, multipart uploads, and no gems to install.
heading: Convert cURL to Ruby Net::HTTP
eyebrow: Ruby standard library
lede: Generate Net::HTTP requests using only what ships with Ruby, with TLS enabled from the URL scheme and redirects left to explicit application policy.
language: ruby
client: nethttp
languageLabel: Ruby
clientLabel: Net::HTTP
order: 62
faqs:
  - question: Do I need any gems for the generated Ruby?
    answer: No. Net::HTTP and URI are both in the standard library, so the output runs on a stock Ruby with no Gemfile and no bundle install. That makes it a good fit for scripts, Rails initialisers, and anywhere adding a dependency is unwelcome.
  - question: Why is curl -L rejected instead of converted?
    answer: Net::HTTP does not follow redirects, and there is no option to make it. Emulating -L means re-issuing the request against the Location header, which raises questions the command cannot answer — how many hops, whether to keep the method and body, whether to resend credentials to a new host. Those are application policy, so the converter reports the limitation rather than inventing a loop.
  - question: Does use_ssl need to be set manually?
    answer: The generator sets it from the URL scheme, so an https URL enables TLS. This matters because Net::HTTP does not infer it, and connecting to port 443 without use_ssl sends plaintext to a TLS port and fails in a confusing way. It is a well-known Ruby footgun and the generated code avoids it.
related:
  - curl-to-ruby
  - curl-to-ruby/faraday
  - curl-to-python/requests
---

## Standard library, no Gemfile

The output requires only `net/http` and `uri`, both of which ship with Ruby.
There is no gem to install and no bundler involved, which makes this the right
target for a one-off script, a Rails initialiser, or any environment where a new
dependency needs justifying.

The request is built as a verb-specific class — `Net::HTTP::Get`,
`Net::HTTP::Post` and so on — and then run inside a `Net::HTTP.start` block so
the connection is closed for you when the block exits.

## TLS is set from the scheme

`use_ssl` is passed explicitly, derived from the URL scheme:

```
Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https")
```

Net::HTTP does not infer this. Connecting to port 443 without `use_ssl` sends
plaintext at a TLS listener and fails with an error that points nowhere useful.
It is one of the standard Ruby HTTP mistakes, and the generated code simply does
not make it.

## Headers, bodies, and uploads

`add_field` appends rather than replaces, so repeated header names are preserved
in order — the same faithfulness the Go and PHP targets manage, and which
dictionary-based clients cannot.

Bodies are assigned to `request.body` as the original bytes, with the content
type set from your command. Multipart uploads use `set_form` with the
`multipart/form-data` encoding, passing file parts as `File.open` with their
posted filename and content type, so uploads keep the metadata the server
expects.

## Current Net::HTTP limitations

**`curl -L` is refused.** This is deliberate, and it is the one place this
target reports a limitation rather than generating something. Net::HTTP has no
redirect option, so following one means writing a loop — and that loop has to
decide how many hops to allow, whether to preserve the method and body across a
307, and whether to resend an `Authorization` header to a different host.
Getting the last of those wrong leaks credentials. Those are decisions for your
application, not for a code generator, so the converter says so. Use the
[Faraday target](/curl-to-ruby/faraday) if you want redirect following handled
by a maintained middleware.

**No connection reuse across requests.** Each `Net::HTTP.start` block opens and
closes a connection. That is fine for a script and wasteful in a loop; hoist the
block and issue several requests inside it if you need throughput.
