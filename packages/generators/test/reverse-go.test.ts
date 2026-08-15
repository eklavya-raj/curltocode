import { parseCurl, requestsAreSemanticallyEqual } from "@curltocode/core";
import { describe, expect, it } from "vitest";

import { generateCode } from "../src/index.js";
import { parseCodeRequest, parseGoRequest } from "../src/reverse/index.js";
import { DynamicExpressionError } from "../src/reverse/types.js";

const request = (source: string) => parseGoRequest(source).request;
const program = (body: string) =>
  `package main\n\nimport "net/http"\n\nfunc main() {\n${body}\n}\n`;

describe("Go net/http", () => {
  it("reads http.NewRequest with headers added across statements", () => {
    const result = parseGoRequest(
      program(`
	payload := strings.NewReader("{\\"n\\":1}")
	req, err := http.NewRequest("POST", "https://api.example.com/v1/items?page=2", payload)
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("X-Token", "abc")
	res, err := client.Do(req)`),
    );
    expect(result.client).toBe("nethttp");
    expect(result.request.method).toBe("POST");
    expect(result.request.url).toBe("https://api.example.com/v1/items");
    expect(result.request.query).toEqual([{ name: "page", value: "2" }]);
    expect(result.request.headers).toEqual([
      { name: "Content-Type", value: "application/json" },
      { name: "X-Token", value: "abc" },
    ]);
    expect(result.request.body).toMatchObject({ kind: "json", raw: '{"n":1}' });
  });

  it("keeps repeated headers from Add but replaces on Set", () => {
    expect(
      request(
        program(`
	req, _ := http.NewRequest("GET", "https://x.test/", nil)
	req.Header.Add("X-D", "1")
	req.Header.Add("X-D", "2")`),
      ).headers,
    ).toEqual([
      { name: "X-D", value: "1" },
      { name: "X-D", value: "2" },
    ]);
    expect(
      request(
        program(`
	req, _ := http.NewRequest("GET", "https://x.test/", nil)
	req.Header.Add("X-D", "1")
	req.Header.Set("X-D", "2")`),
      ).headers,
    ).toEqual([{ name: "X-D", value: "2" }]);
  });

  it("reads cookies from AddCookie composite literals", () => {
    expect(
      request(
        program(`
	req, _ := http.NewRequest("GET", "https://x.test/", nil)
	req.AddCookie(&http.Cookie{Name: "session", Value: "abc"})
	req.AddCookie(&http.Cookie{Name: "locale", Value: "en-IN"})`),
      ).cookies,
    ).toEqual([
      { name: "session", value: "abc" },
      { name: "locale", value: "en-IN" },
    ]);
  });

  it("reads SetBasicAuth", () => {
    expect(
      request(
        program(`
	req, _ := http.NewRequest("GET", "https://x.test/", nil)
	req.SetBasicAuth("user", "pass")`),
      ).auth,
    ).toEqual({ kind: "basic", username: "user", password: "pass" });
  });

  it("treats an ErrUseLastResponse policy as not following redirects", () => {
    expect(
      request(
        program(`req, _ := http.NewRequest("GET", "https://x.test/", nil)`),
      ).options.followRedirects,
      // Go's client follows redirects unless told otherwise.
    ).toBe(true);
    expect(
      request(`package main
func main() {
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	req, _ := http.NewRequest("GET", "https://x.test/", nil)
}`).options.followRedirects,
    ).toBe(false);
  });

  it("reads the http.Get and http.Post helpers", () => {
    expect(request(program(`http.Get("https://x.test/g")`)).method).toBe("GET");
    const posted = request(
      program(
        `http.Post("https://x.test/p", "application/json", strings.NewReader("{}"))`,
      ),
    );
    expect(posted.method).toBe("POST");
    expect(posted.headers).toEqual([
      { name: "Content-Type", value: "application/json" },
    ]);
  });

  it("reads a body through bytes and []byte wrappers", () => {
    for (const wrapper of [
      'bytes.NewBufferString("a=1")',
      'bytes.NewBuffer([]byte("a=1"))',
      'strings.NewReader("a=1")',
    ]) {
      expect(
        request(
          program(
            `req, _ := http.NewRequest("POST", "https://x.test/", ${wrapper})`,
          ),
        ).body,
      ).toMatchObject({ kind: "form-urlencoded", raw: "a=1" });
    }
  });

  it("collects multipart fields written through a writer", () => {
    expect(
      request(
        program(`
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("source", "mobile")
	writer.WriteField("tag", "alpha")
	req, _ := http.NewRequest("POST", "https://x.test/u", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())`),
      ).body,
    ).toEqual({
      kind: "multipart",
      parts: [
        { kind: "field", name: "source", value: "mobile" },
        { kind: "field", name: "tag", value: "alpha" },
      ],
    });
  });

  it("reports a URL it cannot resolve rather than guessing", () => {
    expect(() =>
      parseGoRequest(
        program(`req, _ := http.NewRequest("GET", buildURL(), nil)`),
      ),
    ).toThrowError(DynamicExpressionError);
  });

  it("folds static string concatenation and once-bound variables", () => {
    expect(
      request(
        program(`
	base := "https://api.test"
	req, _ := http.NewRequest("GET", base + "/v1/items", nil)`),
      ).url,
    ).toBe("https://api.test/v1/items");
  });
});

describe("Go Resty", () => {
  it("reads an Execute call with headers and body", () => {
    const result = parseGoRequest(`package main
func main() {
	client := resty.New()
	request := client.R()
	request.Header.Add("Content-Type", "application/json")
	request.SetBody("{\\"n\\":1}")
	response, err := request.Execute("POST", "https://api.example.com/x")
}`);
    expect(result.client).toBe("resty");
    expect(result.request.method).toBe("POST");
    expect(result.request.body).toMatchObject({ kind: "json" });
  });

  it("reads SetAuthToken as bearer auth", () => {
    expect(
      request(`package main
func main() {
	request := resty.New().R()
	request.SetAuthToken("tok123")
	request.Execute("GET", "https://x.test/")
}`).auth,
    ).toEqual({ kind: "bearer", token: "tok123" });
  });

  it("treats NoRedirectPolicy as not following redirects", () => {
    expect(
      request(`package main
func main() {
	client := resty.New()
	client.SetRedirectPolicy(resty.NoRedirectPolicy())
	request := client.R()
	request.Execute("GET", "https://x.test/")
}`).options.followRedirects,
    ).toBe(false);
  });
});

describe("Go round trips", () => {
  it.each([
    "curl 'https://api.example.com/i?tag=a&tag=b' -H 'Accept: application/json'",
    `curl -X POST 'https://api.example.com/i' -H 'Content-Type: application/json' --data-raw '{"n":1}'`,
    "curl -X PUT 'https://api.example.com/x' -d 'a=1&b=2'",
    "curl -X DELETE 'https://api.example.com/x' -H 'X-Token: abc' -L",
    "curl 'https://api.example.com/x' -u 'user:pass'",
    "curl 'https://api.example.com/x' -H 'X-D: 1' -H 'X-D: 2'",
    "curl -X POST 'https://api.example.com/u' -F 'source=mobile' -F 'tag=alpha'",
  ])("round-trips %s through both Go generators", (command) => {
    for (const id of ["go-nethttp", "go-resty"] as const) {
      const original = parseCurl(command).request;
      const code = generateCode(original, id).code;
      const reversed = parseCodeRequest(code);
      expect(
        requestsAreSemanticallyEqual(original, reversed.request),
        JSON.stringify({ id, code }),
      ).toBe(true);
    }
  });
});
