import { useState } from "react";

import type { HttpRequest } from "curltocode";

import {
  bodyPreview,
  displayRequestUrl,
  hasSensitiveValues,
  inspectorHeaders,
  isSensitiveName,
  maskSecret,
} from "./requestPresentation";

export default function RequestInspector({
  request,
}: {
  readonly request: HttpRequest;
}) {
  const [revealedRequest, setRevealedRequest] = useState<HttpRequest>();
  const sensitiveValuesRevealed = revealedRequest === request;
  const containsSensitiveValues = hasSensitiveValues(request);
  const preview = bodyPreview(request, sensitiveValuesRevealed);
  const headers = inspectorHeaders(request);
  return (
    <section className="inspector" aria-labelledby="request-inspector-title">
      <div className="inspector-heading">
        <h3 id="request-inspector-title">Request inspector</h3>
        {containsSensitiveValues && (
          <div className="sensitive-control">
            <span aria-live="polite">
              {sensitiveValuesRevealed
                ? "Sensitive value visible"
                : "Sensitive value hidden"}
            </span>
            <button
              className="sensitive-toggle"
              type="button"
              aria-pressed={sensitiveValuesRevealed}
              onClick={() =>
                setRevealedRequest(
                  sensitiveValuesRevealed ? undefined : request,
                )
              }
            >
              {sensitiveValuesRevealed ? "Hide" : "Reveal"}
            </button>
          </div>
        )}
      </div>
      <div className="request-line">
        <span className="method">{request.method}</span>
        <span className="request-url">
          {displayRequestUrl(request.url, sensitiveValuesRevealed)}
        </span>
      </div>
      <div className="inspector-grid">
        <section className="inspector-section">
          <h4>Headers</h4>
          {headers.length === 0 ? (
            <span className="text-sm text-(--muted)">None</span>
          ) : (
            <dl className="inspector-list">
              {headers.map((header, index) => (
                <div className="inspector-row" key={`${header.name}-${index}`}>
                  <dt>{header.name}</dt>
                  <dd>
                    {!sensitiveValuesRevealed && isSensitiveName(header.name)
                      ? maskSecret(header.value)
                      : header.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
        <section className="inspector-section">
          <h4>Query</h4>
          {request.query.length === 0 ? (
            <span className="text-sm text-(--muted)">None</span>
          ) : (
            <dl className="inspector-list">
              {request.query.map((parameter, index) => (
                <div
                  className="inspector-row"
                  key={`${parameter.name}-${index}`}
                >
                  <dt>{parameter.name}</dt>
                  <dd>
                    {!sensitiveValuesRevealed && isSensitiveName(parameter.name)
                      ? maskSecret(parameter.value)
                      : parameter.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
        <section className="inspector-section">
          <h4>Credentials</h4>
          {request.auth === undefined && request.cookies.length === 0 ? (
            <span className="text-sm text-(--muted)">None</span>
          ) : (
            <dl className="inspector-list">
              {request.auth !== undefined && (
                <div className="inspector-row">
                  <dt>
                    {request.auth.kind === "basic" ? "Basic auth" : "Bearer"}
                  </dt>
                  <dd>
                    {sensitiveValuesRevealed
                      ? request.auth.kind === "basic"
                        ? request.auth.password
                        : request.auth.token
                      : maskSecret(
                          request.auth.kind === "basic"
                            ? request.auth.password
                            : request.auth.token,
                        )}
                  </dd>
                </div>
              )}
              {request.cookies.map((cookie, index) => (
                <div className="inspector-row" key={`${cookie.name}-${index}`}>
                  <dt>{cookie.name}</dt>
                  <dd>
                    {sensitiveValuesRevealed
                      ? cookie.value
                      : maskSecret(cookie.value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>
      {preview !== undefined && (
        <section className="inspector-section mt-5">
          <h4>Body</h4>
          <pre className="body-preview">{preview}</pre>
        </section>
      )}
    </section>
  );
}
