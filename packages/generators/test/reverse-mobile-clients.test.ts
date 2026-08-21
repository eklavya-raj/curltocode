import { describe, expect, it } from "vitest";

import { parseCodeRequest } from "../src/reverse/index.js";

describe("Kotlin OkHttp", () => {
  it("reads the builder chain, including the media type on the body", () => {
    const result = parseCodeRequest(`
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

val client = OkHttpClient.Builder()
    .followRedirects(false)
    .build()

val body = "{\\"active\\":true}".toRequestBody("application/json".toMediaType())

val request = Request.Builder()
    .url("https://api.example.com/v1/accounts/acc_42")
    .method("PATCH", body)
    .addHeader("Authorization", "Bearer tok_live_123")
    .build()
`);
    expect(result.client).toBe("okhttp");
    expect(result.request.method).toBe("PATCH");
    expect(result.request.url).toBe(
      "https://api.example.com/v1/accounts/acc_42",
    );
    expect(result.request.options.followRedirects).toBe(false);
    expect(result.request.body).toEqual({
      kind: "json",
      value: { active: true },
      raw: '{"active":true}',
    });
  });

  it("lifts credentials out of a Credentials.basic header", () => {
    const result = parseCodeRequest(`
import okhttp3.Credentials
import okhttp3.Request

val request = Request.Builder()
    .url("https://api.example.com/v1/private")
    .method("GET", null)
    .header("Authorization", Credentials.basic("service-user", "p@ss:word"))
    .build()
`);
    expect(result.request.auth).toEqual({
      kind: "basic",
      username: "service-user",
      password: "p@ss:word",
    });
    expect(result.request.headers).toEqual([]);
  });

  it("reads a multipart body built through MultipartBody.Builder", () => {
    const result = parseCodeRequest(`
import okhttp3.MultipartBody
import okhttp3.Request

val body = MultipartBody.Builder()
    .setType(MultipartBody.FORM)
    .addFormDataPart("source", "mobile")
    .addFormDataPart("tag", "alpha")
    .build()

val request = Request.Builder()
    .url("https://api.example.com/v1/imports")
    .method("POST", body)
    .build()
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

describe("Kotlin Ktor", () => {
  it("reads the request lambda's method, headers, and body", () => {
    const result = parseCodeRequest(`
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.http.HttpMethod

val client = HttpClient(CIO) {
    followRedirects = false
}

val response: HttpResponse = client.request("https://api.example.com/v1/accounts/acc_42") {
    method = HttpMethod("PATCH")
    header("Content-Type", "application/json")
    header("Authorization", "Bearer tok_live_123")
    setBody("{\\"active\\":true}")
}
`);
    expect(result.client).toBe("ktor");
    expect(result.request.method).toBe("PATCH");
    expect(result.request.options.followRedirects).toBe(false);
    // A bearer Authorization header is lifted into the request's auth field.
    expect(result.request.auth).toEqual({
      kind: "bearer",
      token: "tok_live_123",
    });
  });
});

describe("Swift URLSession", () => {
  it("reads a URLRequest configured through properties and setValue", () => {
    const result = parseCodeRequest(`
import Foundation

var request = URLRequest(url: URL(string: "https://hooks.example.com/events")!)
request.httpMethod = "POST"
request.setValue("text/plain; charset=utf-8", forHTTPHeaderField: "Content-Type")
request.httpBody = Data("deployment complete".utf8)
`);
    expect(result.client).toBe("urlsession");
    expect(result.request.method).toBe("POST");
    expect(result.request.url).toBe("https://hooks.example.com/events");
    expect(result.request.body).toEqual({
      kind: "text",
      value: "deployment complete",
      contentType: "text/plain; charset=utf-8",
    });
  });

  it("reads a redirect-declining delegate as a request that does not follow", () => {
    const result = parseCodeRequest(`
import Foundation

final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

var request = URLRequest(url: URL(string: "https://api.example.com/v1/health")!)
request.httpMethod = "GET"
`);
    expect(result.request.options.followRedirects).toBe(false);
  });
});

describe("Swift Alamofire", () => {
  it("reads the URL, method, and headers from an AF.request call", () => {
    const result = parseCodeRequest(`
import Alamofire
import Foundation

let headers: HTTPHeaders = [
    "Accept": "application/json",
]

let request = AF.request("https://api.example.com/v1/search", method: .get, headers: headers)
    .redirect(using: .doNotFollow)
    .validate()
`);
    expect(result.client).toBe("alamofire");
    expect(result.request.method).toBe("GET");
    expect(result.request.headers).toEqual([
      { name: "Accept", value: "application/json" },
    ]);
    expect(result.request.options.followRedirects).toBe(false);
  });

  it("reads a multipart upload's parts and its destination", () => {
    const result = parseCodeRequest(`
import Alamofire
import Foundation

let request = AF.upload(multipartFormData: { form in
    form.append(Data("mobile".utf8), withName: "source")
    form.append(Data("alpha".utf8), withName: "tag")
}, to: "https://api.example.com/v1/imports", method: .post)
`);
    expect(result.request.method).toBe("POST");
    expect(result.request.url).toBe("https://api.example.com/v1/imports");
    expect(result.request.body).toEqual({
      kind: "multipart",
      parts: [
        { kind: "field", name: "source", value: "mobile" },
        { kind: "field", name: "tag", value: "alpha" },
      ],
    });
  });
});

describe("Dart package:http", () => {
  it("reads a Request configured through its properties", () => {
    const result = parseCodeRequest(`
import 'package:http/http.dart' as http;

Future<void> main() async {
  final url = Uri.parse('https://api.example.com/v1/accounts/acc_42');
  final request = http.Request('PATCH', url);
  request.followRedirects = false;
  request.headers.addAll({
    'Content-Type': 'application/json',
  });
  request.body = '{"active":true}';
}
`);
    expect(result.client).toBe("http");
    expect(result.request.method).toBe("PATCH");
    expect(result.request.url).toBe(
      "https://api.example.com/v1/accounts/acc_42",
    );
    expect(result.request.options.followRedirects).toBe(false);
    expect(result.request.body).toEqual({
      kind: "json",
      value: { active: true },
      raw: '{"active":true}',
    });
  });

  it("reads MultipartRequest fields as multipart parts", () => {
    const result = parseCodeRequest(`
import 'package:http/http.dart' as http;

Future<void> main() async {
  final url = Uri.parse('https://api.example.com/v1/imports');
  final request = http.MultipartRequest('POST', url);
  request.fields['source'] = 'mobile';
}
`);
    expect(result.request.body).toEqual({
      kind: "multipart",
      parts: [{ kind: "field", name: "source", value: "mobile" }],
    });
  });
});

describe("Dart Dio", () => {
  it("reads the Options object that carries the request policy", () => {
    const result = parseCodeRequest(`
import 'package:dio/dio.dart';

Future<void> main() async {
  final dio = Dio();

  final response = await dio.request(
    'https://api.example.com/v1/accounts/acc_42',
    data: '{"active":true}',
    options: Options(
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      followRedirects: false,
      validateStatus: (status) => true,
    ),
  );
}
`);
    expect(result.client).toBe("dio");
    expect(result.request.method).toBe("PATCH");
    expect(result.request.options.followRedirects).toBe(false);
    expect(result.request.body).toEqual({
      kind: "json",
      value: { active: true },
      raw: '{"active":true}',
    });
  });

  it("reads FormData's list form, which keeps a repeated field name", () => {
    const result = parseCodeRequest(`
import 'package:dio/dio.dart';

Future<void> main() async {
  final dio = Dio();
  final data = FormData();
  data.fields.add(MapEntry('tag', 'alpha'));
  data.fields.add(MapEntry('tag', 'beta'));

  final response = await dio.request(
    'https://api.example.com/v1/imports',
    data: data,
    options: Options(method: 'POST'),
  );
}
`);
    expect(result.request.body).toEqual({
      kind: "multipart",
      parts: [
        { kind: "field", name: "tag", value: "alpha" },
        { kind: "field", name: "tag", value: "beta" },
      ],
    });
  });
});
