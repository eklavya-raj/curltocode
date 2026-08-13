---
slug: curl-to-rust/reqwest
parent: curl-to-rust
title: cURL to Rust reqwest Converter | CurlToCode
description: Convert cURL commands to async Rust reqwest code on Tokio, with explicit redirect policy, repeated headers, and full multipart upload support.
heading: Convert cURL to Rust reqwest
eyebrow: Async Rust HTTP
lede: Generate complete async reqwest programs on Tokio, with redirect policy stated explicitly and multipart uploads built from the crate's stable API.
language: rust
client: reqwest
languageLabel: Rust
clientLabel: reqwest
order: 72
faqs:
  - question: Should I use reqwest or ureq?
    answer: reqwest when your application is already async or already on Tokio, when you need stable multipart uploads, or when you want the de facto standard crate with the widest ecosystem support. ureq when you want a small blocking client for a command-line tool and would rather not pull in an async runtime at all.
  - question: Why does the output include a Tokio main attribute?
    answer: reqwest's default API is async, so the request has to run inside a runtime. The tokio::main attribute sets one up around main so the snippet compiles and runs as a standalone program. If you are dropping this into an existing async application, take the client and request lines and leave your own runtime in place.
  - question: How are redirects handled?
    answer: reqwest follows up to ten redirects by default, which cURL does not do without -L. The generated client sets redirect Policy none to match. With -L the builder is dropped entirely in favour of reqwest Client new, so the default policy applies.
related:
  - curl-to-rust
  - curl-to-rust/ureq
  - curl-to-go/nethttp
---

## The default Rust HTTP client

reqwest is the crate most Rust projects reach for, and this target generates a
complete async program around it: a `#[tokio::main]` entry point, a client, the
request, and `Result<(), Box<dyn std::error::Error>>` so the `?` operator works
throughout.

If you are pasting into an existing async application, take the client and
request lines and discard the `main` wrapper — your runtime is already there.

## Redirect policy is explicit

reqwest follows up to ten redirects by default. cURL follows none without `-L`.
The generated client states the match rather than inheriting a default:

```
reqwest::Client::builder()
    .redirect(reqwest::redirect::Policy::none())
    .build()?
```

When your command does have `-L`, the builder disappears and the output uses
plain `reqwest::Client::new()`, whose default policy is what `-L` asks for. The
two forms make the difference visible at a glance.

## Headers, bodies, and multipart

`.header()` calls append to the request's `HeaderMap`, so repeated header names
are preserved in order rather than overwriting one another.

Bodies pass through as their original bytes with the content type from your
command. Notably, no `json` feature is required: the payload you supplied is
already serialised, and re-serialising it through `serde` could reorder keys or
change formatting. Passing the original string keeps the request byte-identical.

Multipart uploads are fully supported here, which is the main functional
difference from the ureq target. `reqwest::multipart::Form` builds text parts
with `.text()` and file parts with `Part::bytes(std::fs::read(...))`, carrying
the posted filename and declared MIME type.

## Choosing between reqwest and ureq

Pick **reqwest** if your application is already async, if you need multipart, or
if you want the crate with the broadest ecosystem support. It brings in Tokio
and a fairly deep dependency tree, which is unremarkable in a service and heavy
in a small utility.

Pick **[ureq](/curl-to-rust/ureq)** for synchronous command-line tools where a
blocking call is simpler and an async runtime would be dead weight. Its
multipart support is currently behind an explicitly unversioned module, so this
converter does not generate it.

Add the dependencies to `Cargo.toml`:

```
reqwest = "0.13"
tokio = { version = "1", features = ["full"] }
```
