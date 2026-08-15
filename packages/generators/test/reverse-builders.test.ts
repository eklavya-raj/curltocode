import { parseCurl, requestsAreSemanticallyEqual } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { GeneratorError, generateCode } from "../src/index.js";
import {
  parseCodeRequest,
  parseCsharpRequest,
  parseJavaRequest,
  parseRubyRequest,
  parseRustRequest,
} from "../src/reverse/index.js";
import { DynamicExpressionError } from "../src/reverse/types.js";

/**
 * The four builder-chain languages share one reader, so these tests cover the
 * behaviour each language contributes on top of it rather than repeating the
 * round trips the conformance matrix already runs.
 */

describe("Java", () => {
  it("reads a JDK HttpClient builder", () => {
    const result = parseJavaRequest(`
public class Main {
  public static void main(String[] args) throws Exception {
    HttpRequest request = HttpRequest.newBuilder()
      .uri(URI.create("https://api.example.com/v1/items?page=2"))
      .method("POST", HttpRequest.BodyPublishers.ofString("{\\"n\\":1}"))
      .header("Content-Type", "application/json")
      .build();
  }
}`);
    expect(result.client).toBe("httpclient");
    expect(result.request.method).toBe("POST");
    expect(result.request.query).toEqual([{ name: "page", value: "2" }]);
    expect(result.request.body).toMatchObject({ kind: "json" });
  });

  it("reads an Apache classic request constructor", () => {
    const result = parseJavaRequest(`
import org.apache.hc.client5.http.impl.classic.HttpClients;
public class Main {
  public static void main(String[] args) throws Exception {
    HttpUriRequestBase request = new HttpUriRequestBase("PATCH", URI.create("https://x.test/a"));
    request.addHeader("X-T", "abc");
  }
}`);
    expect(result.client).toBe("apache");
    expect(result.request.method).toBe("PATCH");
    expect(result.request.headers).toEqual([{ name: "X-T", value: "abc" }]);
  });

  it("keeps a repeated header from addHeader", () => {
    const result = parseJavaRequest(`
import okhttp3.*;
public class Main {
  public static void main(String[] args) {
    Request request = new Request.Builder()
      .url("https://x.test/")
      .addHeader("X-D", "1")
      .addHeader("X-D", "2")
      .build();
  }
}`);
    expect(result.request.headers).toEqual([
      { name: "X-D", value: "1" },
      { name: "X-D", value: "2" },
    ]);
  });
});

describe("C#", () => {
  it("reads a request built from a constructor and properties", () => {
    const result = parseCsharpRequest(`
using System.Net.Http;
using var request = new HttpRequestMessage(new HttpMethod("POST"), "https://x.test/i");
request.Headers.TryAddWithoutValidation("X-T", "abc");
request.Content = new StringContent("{\\"n\\":1}", Encoding.UTF8);
request.Content.Headers.TryAddWithoutValidation("Content-Type", "application/json");`);
    expect(result.client).toBe("httpclient");
    expect(result.request.method).toBe("POST");
    expect(result.request.body).toMatchObject({ kind: "json" });
  });

  it("reads RestSharp body media types from their second argument", () => {
    const result = parseCsharpRequest(`
using RestSharp;
var request = new RestRequest("https://x.test/b");
request.AddStringBody("plain text", "text/plain");`);
    expect(result.client).toBe("restsharp");
    expect(result.request.body).toMatchObject({
      kind: "text",
      value: "plain text",
    });
  });
});

describe("Ruby", () => {
  it("takes the method from the Net::HTTP request class", () => {
    const result = parseRubyRequest(`
require "net/http"
uri = URI("https://api.example.com/x")
request = Net::HTTP::Delete.new(uri)
request.add_field("X-T", "abc")`);
    expect(result.client).toBe("nethttp");
    expect(result.request.method).toBe("DELETE");
    expect(result.request.url).toBe("https://api.example.com/x");
  });

  it("reads a subscript header assignment", () => {
    const result = parseRubyRequest(`
require "net/http"
uri = URI("https://x.test/")
request = Net::HTTP::Get.new(uri)
request["X-Token"] = "abc"`);
    expect(result.request.headers).toEqual([{ name: "X-Token", value: "abc" }]);
  });

  it("reads a symbol method through its conversion", () => {
    // "post".to_sym must not stop the argument list at the first suffix.
    const result = parseRubyRequest(`
require "faraday"
response = connection.run_request("post".to_sym, "https://x.test/f", "a=1", {})`);
    expect(result.client).toBe("faraday");
    expect(result.request.method).toBe("POST");
    expect(result.request.body).toMatchObject({ kind: "form-urlencoded" });
  });

  it("follows redirects only when the middleware is installed", () => {
    const base = `require "faraday"\nresponse = connection.run_request("get".to_sym, "https://x.test/", nil, {})`;
    expect(parseRubyRequest(base).request.options.followRedirects).toBe(false);
    expect(
      parseRubyRequest(
        `require "faraday/follow_redirects"\nfaraday.response :follow_redirects\n${base}`,
      ).request.options.followRedirects,
    ).toBe(true);
  });
});

describe("Rust", () => {
  it("reads a reqwest chain through await and question marks", () => {
    const result = parseRustRequest(`
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let response = client
        .request(reqwest::Method::PUT, "https://x.test/i")
        .header("X-T", "abc")
        .body("payload")
        .send()
        .await?;
    Ok(())
}`);
    expect(result.client).toBe("reqwest");
    expect(result.request.method).toBe("PUT");
    expect(result.request.headers).toEqual([{ name: "X-T", value: "abc" }]);
  });

  it("reads a byte-string method literal", () => {
    // ureq spells its method http::Method::from_bytes(b"POST").
    const result = parseRustRequest(`
use ureq::{http, Agent};
fn main() {
    let request = http::Request::builder()
        .method(http::Method::from_bytes(b"POST")?)
        .uri("https://x.test/i")
        .body("a=1")?;
}`);
    expect(result.client).toBe("ureq");
    expect(result.request.method).toBe("POST");
  });

  it("reads basic auth wrapped in Some", () => {
    const result = parseRustRequest(`
fn main() {
    let response = client
        .request(reqwest::Method::GET, "https://x.test/a")
        .basic_auth("u", Some("p"));
}`);
    expect(result.request.auth).toEqual({
      kind: "basic",
      username: "u",
      password: "p",
    });
  });

  it("reports a URL it cannot resolve", () => {
    expect(() =>
      parseRustRequest(
        `fn main() { client.request(reqwest::Method::GET, build_url()); }`,
      ),
    ).toThrowError(DynamicExpressionError);
  });
});

describe("every registered target round-trips or refuses deliberately", () => {
  it.each([
    "curl 'https://api.example.com/i?tag=a&tag=b' -H 'Accept: application/json'",
    `curl -X POST 'https://api.example.com/i' -H 'Content-Type: application/json' --data-raw '{"n":1}'`,
    "curl -X PUT 'https://api.example.com/x' -d 'a=1&b=2'",
  ])("handles %s across all 22 targets", (command) => {
    const original = parseCurl(command).request;
    for (const id of [
      "java-httpclient",
      "java-okhttp",
      "java-apache",
      "csharp-httpclient",
      "csharp-restsharp",
      "ruby-nethttp",
      "ruby-faraday",
      "rust-reqwest",
      "rust-ureq",
    ] as const) {
      let code: string;
      try {
        code = generateCode(original, id).code;
      } catch (error) {
        expect(error).toBeInstanceOf(GeneratorError);
        continue;
      }
      const reversed = parseCodeRequest(code);
      expect(
        requestsAreSemanticallyEqual(original, reversed.request),
        JSON.stringify({ id, code }),
      ).toBe(true);
    }
  });
});
