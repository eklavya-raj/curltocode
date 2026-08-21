import { requestUrl } from "@curltocode/core";
import type { HttpRequest, RequestBody } from "@curltocode/core";

import { hasDuplicateHeaderNames, materializeHeaders } from "../headers.js";
import type { CodeGenerator, GeneratedCode } from "../types.js";
import { GeneratorError } from "../types.js";
import { cString } from "./literal.js";
import {
  assertNoBoundaryCollision,
  MULTIPART_CONTENT_TYPE,
  MULTIPART_EPILOGUE,
  multipartPartHeader,
} from "./multipart.js";

const objc = (value: string): string => `@${cString(value)}`;

interface ObjcBody {
  readonly prelude: readonly string[];
  readonly assignment: string | undefined;
  readonly contentType: string | undefined;
}

function multipartBody(
  body: Extract<RequestBody, { kind: "multipart" }>,
): ObjcBody {
  const lines = ["NSMutableData *body = [NSMutableData data];"];
  const utf8 = (value: string): string =>
    `[${objc(value)} dataUsingEncoding:NSUTF8StringEncoding]`;
  for (const part of body.parts) {
    lines.push(`[body appendData:${utf8(multipartPartHeader(part))}];`);
    if (part.kind === "field") {
      assertNoBoundaryCollision(part.name, part.value);
      lines.push(`[body appendData:${utf8(part.value)}];`);
    } else {
      lines.push(
        `[body appendData:[NSData dataWithContentsOfFile:${objc(part.path)}]];`,
      );
    }
    lines.push(`[body appendData:${utf8("\r\n")}];`);
  }
  lines.push(`[body appendData:${utf8(MULTIPART_EPILOGUE)}];`);
  return {
    prelude: lines,
    assignment: "request.HTTPBody = body;",
    contentType: MULTIPART_CONTENT_TYPE,
  };
}

function objcBody(body: RequestBody | undefined): ObjcBody {
  if (body === undefined) {
    return { prelude: [], assignment: undefined, contentType: undefined };
  }
  if (body.kind === "multipart") return multipartBody(body);
  const inline = (value: string): ObjcBody => ({
    prelude: [],
    assignment: `request.HTTPBody = [${objc(value)} dataUsingEncoding:NSUTF8StringEncoding];`,
    contentType: undefined,
  });
  if (body.kind === "json" || body.kind === "form-urlencoded") {
    return inline(body.raw);
  }
  if (body.kind === "text") return inline(body.value);
  if (body.source.kind === "inline") return inline(body.source.value);
  return {
    prelude: [],
    assignment: `request.HTTPBody = [NSData dataWithContentsOfFile:${objc(body.source.path)}];`,
    contentType: undefined,
  };
}

/**
 * Objective-C with NSURLSession, which is what an existing iOS or macOS code
 * base is calling from unless it has been migrated to Swift.
 */
export class ObjectiveCGenerator implements CodeGenerator {
  readonly id = "objectivec-nsurlsession" as const;
  readonly language = "objectivec" as const;
  readonly client = "nsurlsession" as const;

  generate(request: HttpRequest): GeneratedCode {
    const headers = materializeHeaders(request, {
      basicAuthHeader: true,
      cookieHeader: true,
    });
    if (hasDuplicateHeaderNames(headers)) {
      throw new GeneratorError(
        "-[NSMutableURLRequest addValue:forHTTPHeaderField:] folds a repeated header name into one comma-separated value rather than sending the field twice, which is not equivalent for every header.",
        "GENERATOR_DUPLICATE_HEADERS",
      );
    }
    const body = objcBody(request.body);

    const lines = [
      `NSURL *url = [NSURL URLWithString:${objc(requestUrl(request))}];`,
      "NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];",
      `request.HTTPMethod = ${objc(request.method)};`,
    ];
    for (const header of headers) {
      if (
        body.contentType !== undefined &&
        header.name.toLowerCase() === "content-type"
      ) {
        continue;
      }
      lines.push(
        `[request setValue:${objc(header.value)} forHTTPHeaderField:${objc(header.name)}];`,
      );
    }
    if (body.contentType !== undefined) {
      lines.push(
        `[request setValue:${objc(body.contentType)} forHTTPHeaderField:@"Content-Type"];`,
      );
    }
    if (body.prelude.length > 0) lines.push("", ...body.prelude);
    if (body.assignment !== undefined) lines.push("", body.assignment);

    // NSURLSession follows redirects unless a task delegate declines them, so
    // the non-following case needs a real delegate rather than a flag.
    const delegate = request.options.followRedirects
      ? []
      : [
          "@interface NoRedirects : NSObject <NSURLSessionTaskDelegate>",
          "@end",
          "",
          "@implementation NoRedirects",
          "- (void)URLSession:(NSURLSession *)session",
          "              task:(NSURLSessionTask *)task",
          "willPerformHTTPRedirection:(NSHTTPURLResponse *)response",
          "        newRequest:(NSURLRequest *)request",
          " completionHandler:(void (^)(NSURLRequest *))completionHandler {",
          "    completionHandler(nil);",
          "}",
          "@end",
          "",
        ];
    const session = request.options.followRedirects
      ? "NSURLSession *session = [NSURLSession sharedSession];"
      : [
          "NSURLSession *session = [NSURLSession sessionWithConfiguration:[NSURLSessionConfiguration defaultSessionConfiguration]",
          "                                                      delegate:[NoRedirects new]",
          "                                                 delegateQueue:nil];",
        ].join("\n");

    return {
      code: [
        "#import <Foundation/Foundation.h>",
        "",
        ...delegate,
        ...lines,
        "",
        session,
        "NSURLSessionDataTask *task = [session dataTaskWithRequest:request",
        "                                        completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {",
        "    if (error) {",
        '        NSLog(@"%@", error);',
        "        return;",
        "    }",
        '    NSLog(@"%@", [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]);',
        "}];",
        "[task resume];",
      ].join("\n"),
      language: this.language,
      client: this.client,
    };
  }
}
