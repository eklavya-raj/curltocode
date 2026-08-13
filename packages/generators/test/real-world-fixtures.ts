/**
 * Production-shaped requests shared by the registry-wide generator tests.
 * Values are deliberately distinctive so assertions prove that each semantic
 * field survives, rather than passing on generic syntax such as `post`.
 */
export const REAL_WORLD_REQUESTS = {
  health: "curl 'https://api.example.com/v1/health'",
  search: `curl 'https://api.example.com/v1/search?q=hello%20world&tag=typescript&tag=security' \
  -H 'Accept: application/json' \
  -H 'X-Request-ID: req-2026-08-13'`,
  accountPatch: `curl 'https://api.example.com/v1/accounts/acc_42' \
  -X PATCH \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer tok_live_123' \
  -b 'session=sess_abc; locale=en-IN' \
  --data-raw '{"displayName":"Eklavya 👋","active":true,"roles":["admin","developer"]}'`,
  basicAuth: `curl 'https://api.example.com/v1/private' \
  -u 'service-user:p@ss:word'`,
  oauthForm: `curl 'https://auth.example.com/oauth/token' \
  -d 'grant_type=client_credentials' \
  -d 'scope=read' \
  -d 'scope=write'`,
  webhookText: `curl 'https://hooks.example.com/events' \
  -X POST \
  -H 'Content-Type: text/plain; charset=utf-8' \
  --data-raw 'deployment complete 🚀
second line'`,
  customMethod: "curl 'https://cache.example.com/v1/entries/user-42' -X PURGE",
  duplicateHeaders: `curl 'https://api.example.com/v1/features' \
  -H 'X-Feature: alpha' \
  -H 'X-Feature: beta'`,
  duplicateCookies: `curl 'https://api.example.com/v1/sessions' \
  -b 'session=first; session=second'`,
  multipartUpload: `curl 'https://uploads.example.com/v1/documents' \
  -F 'description=Quarterly report' \
  -F 'document=@/tmp/report.pdf;type=application/pdf'`,
  binaryFile: `curl 'https://uploads.example.com/v1/raw' \
  -X PUT \
  -H 'Content-Type: application/octet-stream' \
  --data-binary '@payload.bin'`,
  inlineBinary: `curl 'https://telemetry.example.com/v1/envelopes' \
  -X POST \
  -H 'Content-Type: application/octet-stream' \
  --data-binary 'protobuf-wire-bytes-01'`,
  deleteWithTrace: `curl 'https://api.example.com/v1/users/user-42?hard=true' \
  -X DELETE \
  -H 'If-Match: etag-user-42' \
  -H 'X-Audit-Reason: duplicate-account'`,
} as const;
