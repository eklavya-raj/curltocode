import { createHttpRequest } from "@curltocode/core";
import type {
  Cookie,
  Header,
  RequestAuth,
  RequestBody,
} from "@curltocode/core";

import { normalizeHeaders } from "../normalize.js";
import { DynamicExpressionError } from "../types.js";
import type {
  DynamicIssue,
  ReverseClient,
  ReverseParseResult,
} from "../types.js";
import { classifyStringBody, multipartBody } from "./body.js";
import { asString } from "./values.js";
import type { StaticValue } from "./values.js";

/**
 * The state a builder-style parser accumulates, and the one place it is turned
 * into a request.
 *
 * Every chain language collects the same handful of facts in the same way, so
 * the ordering rules — content type deciding the body representation, cookies
 * and auth being lifted out of headers — are applied once rather than repeated
 * with small differences per language.
 */
export class RequestBuilder {
  method: string | undefined;
  url: string | undefined;
  bodyText: string | undefined;
  bodyValue: StaticValue | undefined;
  bodyContentType: string | undefined;
  auth: RequestAuth | undefined;
  followRedirects = true;
  found = false;
  readonly headers: Header[] = [];
  readonly cookies: Cookie[] = [];
  readonly parts: { name: string; value: string }[] = [];
  readonly issues: DynamicIssue[] = [];

  constructor(readonly client: ReverseClient) {}

  issue(kind: DynamicIssue["kind"], message: string, expression: string): void {
    this.issues.push({ kind, message, expression });
  }

  /** Append a header, or replace one of the same name when asked. */
  header(name: string, value: string, replace = false): void {
    if (replace) {
      const index = this.headers.findIndex(
        (header) => header.name.toLowerCase() === name.toLowerCase(),
      );
      if (index >= 0) {
        this.headers.splice(index, 1, { name, value });
        return;
      }
    }
    this.headers.push({ name, value });
  }

  /** Record a header from two argument values, reporting a dynamic one. */
  headerFrom(
    name: StaticValue | undefined,
    value: StaticValue | undefined,
    origin: string,
    replace = false,
  ): void {
    const headerName = name === undefined ? undefined : asString(name);
    const headerValue = value === undefined ? undefined : asString(value);
    if (headerName === undefined || headerValue === undefined) {
      this.issue(
        "headers",
        "Dynamic header cannot be resolved statically.",
        origin,
      );
      return;
    }
    this.header(headerName, headerValue, replace);
  }

  private contentType(): string | undefined {
    return (
      this.headers.find(
        (header) => header.name.toLowerCase() === "content-type",
      )?.value ?? this.bodyContentType
    );
  }

  private body(): RequestBody | undefined {
    if (this.parts.length > 0) return multipartBody(this.parts);
    if (this.bodyText === undefined) return undefined;
    return classifyStringBody(this.bodyText, this.contentType());
  }

  build(): ReverseParseResult {
    if (this.url === undefined) {
      this.issue(
        "url",
        "Dynamic URL cannot be resolved statically.",
        "request URL",
      );
    }
    if (this.method === undefined) {
      this.issue(
        "method",
        "Dynamic method cannot be resolved statically.",
        "request method",
      );
    }
    const headers = [...this.headers];
    if (
      this.bodyContentType !== undefined &&
      !headers.some((header) => header.name.toLowerCase() === "content-type")
    ) {
      headers.push({ name: "Content-Type", value: this.bodyContentType });
    }
    const normalized = normalizeHeaders(headers);
    const cookies = [...normalized.cookies, ...this.cookies];
    const auth = this.auth ?? normalized.auth;
    const body = this.body();

    if (this.issues.length > 0) {
      throw new DynamicExpressionError(this.issues, {
        client: this.client,
        ...(this.method === undefined ? {} : { method: this.method }),
        ...(this.url === undefined ? {} : { url: this.url }),
        headers: normalized.headers,
        cookies,
        ...(auth === undefined ? {} : { auth }),
        ...(body === undefined ? {} : { body }),
        followRedirects: this.followRedirects,
      });
    }
    return {
      client: this.client,
      request: createHttpRequest(this.url ?? "", {
        method: this.method ?? "GET",
        headers: normalized.headers,
        cookies,
        ...(auth === undefined ? {} : { auth }),
        ...(body === undefined ? {} : { body }),
        followRedirects: this.followRedirects,
      }),
    };
  }
}
