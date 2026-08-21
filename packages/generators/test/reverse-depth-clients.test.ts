import { describe, expect, it } from "vitest";

import { parseCodeRequest } from "../src/reverse/index.js";
import { DynamicExpressionError } from "../src/reverse/types.js";

describe("Python standard library and urllib3", () => {
  it("rebuilds a URL split across an http.client connection and request", () => {
    const result = parseCodeRequest(`
import http.client

connection = http.client.HTTPSConnection("api.example.com")
connection.request("DELETE", "/v1/users/user-42?hard=true", None, {"If-Match": "etag-1"})
`);
    expect(result.client).toBe("httpclient");
    expect(result.request.method).toBe("DELETE");
    expect(result.request.url).toBe("https://api.example.com/v1/users/user-42");
    expect(result.request.query).toEqual([{ name: "hard", value: "true" }]);
    expect(result.request.headers).toEqual([
      { name: "If-Match", value: "etag-1" },
    ]);
  });

  it("uses plain HTTP for an HTTPConnection and keeps an explicit port", () => {
    const result = parseCodeRequest(`
import http.client

connection = http.client.HTTPConnection("localhost", 8080)
connection.request("GET", "/health")
`);
    expect(result.request.url).toBe("http://localhost:8080/health");
  });

  it("never claims http.client follows redirects", () => {
    const result = parseCodeRequest(`
import http.client
connection = http.client.HTTPSConnection("api.example.com")
connection.request("GET", "/v1/health")
`);
    expect(result.request.options.followRedirects).toBe(false);
  });

  it("reads a hand-assembled multipart payload back into fields", () => {
    const result = parseCodeRequest(`
import http.client

connection = http.client.HTTPSConnection("api.example.com")
headers = {"Content-Type": "multipart/form-data; boundary=B1"}
body = b"".join([
    "--B1\\r\\nContent-Disposition: form-data; name=\\"source\\"\\r\\n\\r\\n".encode("utf-8"),
    "mobile".encode("utf-8"),
    b"\\r\\n",
    "--B1--\\r\\n".encode("utf-8"),
])
connection.request("POST", "/v1/imports", body, headers)
`);
    expect(result.request.body).toEqual({
      kind: "multipart",
      parts: [{ kind: "field", name: "source", value: "mobile" }],
    });
  });

  it("reads urllib3 options and its redirect switch", () => {
    const result = parseCodeRequest(`
import urllib3

http = urllib3.PoolManager()
response = http.request(
    "POST",
    "https://auth.example.com/oauth/token",
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    body="grant_type=client_credentials",
    redirect=False,
)
`);
    expect(result.client).toBe("urllib3");
    expect(result.request.options.followRedirects).toBe(false);
    expect(result.request.body).toEqual({
      kind: "form-urlencoded",
      fields: [{ name: "grant_type", value: "client_credentials" }],
      raw: "grant_type=client_credentials",
    });
  });

  it("keeps a repeated header name from urllib3's HTTPHeaderDict", () => {
    const result = parseCodeRequest(`
import urllib3

http = urllib3.PoolManager()
headers = urllib3.HTTPHeaderDict()
headers.add("X-Feature", "alpha")
headers.add("X-Feature", "beta")
response = http.request("GET", "https://api.example.com/v1/features", headers=headers)
`);
    expect(result.request.headers).toEqual([
      { name: "X-Feature", value: "alpha" },
      { name: "X-Feature", value: "beta" },
    ]);
  });

  it("reads urllib3 fields as multipart parts", () => {
    const result = parseCodeRequest(`
import urllib3

http = urllib3.PoolManager()
response = http.request(
    "POST",
    "https://api.example.com/v1/imports",
    fields=[("source", (None, "mobile")), ("tag", (None, "alpha"))],
)
`);
    expect(result.request.body).toEqual({
      kind: "multipart",
      parts: [
        { kind: "field", name: "source", value: "mobile" },
        { kind: "field", name: "tag", value: "alpha" },
      ],
    });
  });
});

describe("Ruby HTTParty and rest-client", () => {
  it("reads HTTParty keyword options, including basic auth", () => {
    const result = parseCodeRequest(`
require "httparty"

response = HTTParty.patch(
  "https://api.example.com/v1/accounts/acc_42",
  headers: { "Content-Type" => "application/json" },
  body: "{\\"active\\":true}",
  basic_auth: { username: "service-user", password: "p@ss:word" },
  follow_redirects: false,
)
`);
    expect(result.client).toBe("httparty");
    expect(result.request.method).toBe("PATCH");
    expect(result.request.auth).toEqual({
      kind: "basic",
      username: "service-user",
      password: "p@ss:word",
    });
    expect(result.request.options.followRedirects).toBe(false);
  });

  it("reads rest-client's execute form, including its method symbol", () => {
    const result = parseCodeRequest(`
require "rest-client"

response = RestClient::Request.execute(
  method: :delete,
  url: "https://api.example.com/v1/users/user-42",
  headers: { "If-Match" => "etag-1" },
  max_redirects: 0,
)
`);
    expect(result.client).toBe("restclient");
    expect(result.request.method).toBe("DELETE");
    expect(result.request.options.followRedirects).toBe(false);
  });

  it("reads the rest-client per-verb shortcut", () => {
    const result = parseCodeRequest(`
require "rest-client"
RestClient.post("https://api.example.com/v1/notes", "hello", { "Content-Type" => "text/plain" })
`);
    expect(result.request.method).toBe("POST");
    expect(result.request.body).toEqual({
      kind: "text",
      value: "hello",
      contentType: "text/plain",
    });
  });
});

describe("PHP Symfony and Laravel", () => {
  it("reads Symfony's options, including its redirect budget", () => {
    const result = parseCodeRequest(`<?php

use Symfony\\Component\\HttpClient\\HttpClient;

$client = HttpClient::create();

$response = $client->request("POST", "https://auth.example.com/oauth/token", [
    'headers' => [
        "Content-Type" => "application/x-www-form-urlencoded",
    ],
    'body' => "grant_type=client_credentials",
    'max_redirects' => 0,
]);
`);
    expect(result.client).toBe("symfony");
    expect(result.request.method).toBe("POST");
    expect(result.request.options.followRedirects).toBe(false);
  });

  it("reads Symfony's auth_basic option", () => {
    const result = parseCodeRequest(`<?php

use Symfony\\Component\\HttpClient\\HttpClient;

$client = HttpClient::create();
$response = $client->request("GET", "https://api.example.com/v1/private", [
    'auth_basic' => ["service-user", "p@ss:word"],
]);
`);
    expect(result.request.auth).toEqual({
      kind: "basic",
      username: "service-user",
      password: "p@ss:word",
    });
  });

  it("reads a Laravel chain and its withoutRedirecting step", () => {
    const result = parseCodeRequest(`<?php

use Illuminate\\Support\\Facades\\Http;

$response = Http::withHeaders([
        "Authorization" => "Bearer tok_live_123",
    ])
    ->withBody("{\\"active\\":true}", "application/json")
    ->withoutRedirecting()
    ->send("PATCH", "https://api.example.com/v1/accounts/acc_42");
`);
    expect(result.client).toBe("laravel");
    expect(result.request.method).toBe("PATCH");
    expect(result.request.options.followRedirects).toBe(false);
    expect(result.request.body).toEqual({
      kind: "json",
      value: { active: true },
      raw: '{"active":true}',
    });
  });

  it("reads Laravel attachments as multipart fields", () => {
    const result = parseCodeRequest(`<?php

use Illuminate\\Support\\Facades\\Http;

$response = Http::attach("source", "mobile")
    ->attach("tag", "alpha")
    ->send("POST", "https://api.example.com/v1/imports");
`);
    expect(result.request.body).toEqual({
      kind: "multipart",
      parts: [
        { kind: "field", name: "source", value: "mobile" },
        { kind: "field", name: "tag", value: "alpha" },
      ],
    });
  });

  it("reports a Laravel attachment whose contents are read at run time", () => {
    expect.assertions(2);
    try {
      parseCodeRequest(`<?php

use Illuminate\\Support\\Facades\\Http;

$response = Http::attach("document", file_get_contents("/tmp/a.pdf"), "a.pdf")
    ->send("POST", "https://api.example.com/v1/imports");
`);
    } catch (error) {
      expect(error).toBeInstanceOf(DynamicExpressionError);
      expect((error as DynamicExpressionError).message).toContain(
        "reads the file at run time",
      );
    }
  });
});

describe("C# Flurl", () => {
  it("reads the chain's URL, headers, and redirect setting", () => {
    const result = parseCodeRequest(`
using Flurl.Http;
using System.Net.Http;

var response = await "https://api.example.com/v1/search"
    .WithHeader("Accept", "application/json")
    .WithSettings(settings => settings.Redirects.Enabled = false)
    .AllowAnyHttpStatus()
    .SendAsync(HttpMethod.Get);
`);
    expect(result.client).toBe("flurl");
    expect(result.request.method).toBe("GET");
    expect(result.request.url).toBe("https://api.example.com/v1/search");
    expect(result.request.options.followRedirects).toBe(false);
  });

  it("takes the media type from the StringContent that carries the body", () => {
    const result = parseCodeRequest(`
using Flurl.Http;
using System.Net.Http;
using System.Text;

var response = await "https://api.example.com/v1/accounts/acc_42"
    .AllowAnyHttpStatus()
    .SendAsync(HttpMethod.Patch, new StringContent("{\\"active\\":true}", Encoding.UTF8, "application/json"));
`);
    expect(result.request.method).toBe("PATCH");
    expect(result.request.body).toEqual({
      kind: "json",
      value: { active: true },
      raw: '{"active":true}',
    });
  });

  it("reads Flurl's basic-auth step", () => {
    const result = parseCodeRequest(`
using Flurl.Http;
using System.Net.Http;

var response = await "https://api.example.com/v1/private"
    .WithBasicAuth("service-user", "p@ss:word")
    .SendAsync(HttpMethod.Get);
`);
    expect(result.request.auth).toEqual({
      kind: "basic",
      username: "service-user",
      password: "p@ss:word",
    });
  });
});

describe("Java HttpURLConnection", () => {
  it("reads the connection setters and the stream it is fed", () => {
    const result = parseCodeRequest(`
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;

URI uri = URI.create("https://auth.example.com/oauth/token");
HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();
connection.setRequestMethod("POST");
connection.setInstanceFollowRedirects(false);
connection.addRequestProperty("Content-Type", "application/x-www-form-urlencoded");
connection.setDoOutput(true);

try (OutputStream output = connection.getOutputStream()) {
    output.write("grant_type=client_credentials".getBytes(StandardCharsets.UTF_8));
}
`);
    expect(result.client).toBe("httpurlconnection");
    expect(result.request.method).toBe("POST");
    expect(result.request.options.followRedirects).toBe(false);
    expect(result.request.body).toEqual({
      kind: "form-urlencoded",
      fields: [{ name: "grant_type", value: "client_credentials" }],
      raw: "grant_type=client_credentials",
    });
  });

  it("keeps a repeated header name added through addRequestProperty", () => {
    const result = parseCodeRequest(`
import java.net.HttpURLConnection;
import java.net.URI;

URI uri = URI.create("https://api.example.com/v1/features");
HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();
connection.setRequestMethod("GET");
connection.addRequestProperty("X-Feature", "alpha");
connection.addRequestProperty("X-Feature", "beta");
`);
    expect(result.request.headers).toEqual([
      { name: "X-Feature", value: "alpha" },
      { name: "X-Feature", value: "beta" },
    ]);
  });
});
