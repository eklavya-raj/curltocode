/**
 * Every command-line option cURL accepts, and what this project does with it.
 *
 * The table exists so that no option can be met with a guess. AGENTS.md
 * section 10 requires that a meaningful option is either supported or reported;
 * enumerating the whole surface is what makes that checkable rather than
 * aspirational. `curl-options.test.ts` asserts this table still covers
 * everything the installed cURL reports, so a new release surfaces as a failing
 * test rather than as a silently mishandled command.
 *
 * Generated against cURL 8.7.1 and then hand-classified.
 */

export type OptionDisposition =
  /** Read into the normalized request. */
  | "supported"
  /** Changes only the local cURL process, never the request on the wire. */
  | "process"
  /**
   * Affects the exchange, but every client this project generates already
   * behaves this way, so the generated code needs nothing extra.
   */
  | "transparent"
  /**
   * Changes how the request reaches the server, but has no portable
   * representation in the model. Accepted with a warning.
   */
  | "warn"
  /** Belongs to a protocol other than HTTP. Rejected by name. */
  | "protocol"
  /**
   * HTTP, but not representable without executing something: reading a file,
   * answering a server challenge, or computing a signature. Rejected with the
   * specific reason.
   */
  | "unrepresentable";

export interface CurlOptionSpec {
  readonly long: string;
  readonly short?: string;
  readonly takesValue?: boolean;
  readonly disposition: OptionDisposition;
  /** Why the option cannot be represented, for warnings and errors. */
  readonly reason?: string;
}

export const CURL_OPTIONS: readonly CurlOptionSpec[] = [
  {
    long: "--abstract-unix-socket",
    takesValue: true,
    disposition: "warn",
    reason: "connection routing was customized",
  },
  {
    long: "--alt-svc",
    takesValue: true,
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  {
    long: "--anyauth",
    disposition: "unrepresentable",
    reason: "the authentication scheme is negotiated with the server",
  },
  { long: "--append", short: "-a", disposition: "protocol" },
  {
    long: "--aws-sigv4",
    takesValue: true,
    disposition: "unrepresentable",
    reason: "it computes a signature from credentials at request time",
  },
  { long: "--basic", disposition: "process" },
  {
    long: "--ca-native",
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--cacert",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--capath",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--cert",
    short: "-E",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--cert-status",
    disposition: "warn",
    reason: "certificate verification was relaxed",
  },
  {
    long: "--cert-type",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--ciphers",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--compressed",
    disposition: "transparent",
    reason: "every generated client negotiates compression itself",
  },
  { long: "--compressed-ssh", disposition: "protocol" },
  {
    long: "--config",
    short: "-K",
    takesValue: true,
    disposition: "unrepresentable",
    reason: "it reads further arguments from a file",
  },
  { long: "--connect-timeout", takesValue: true, disposition: "process" },
  {
    long: "--connect-to",
    takesValue: true,
    disposition: "warn",
    reason: "connection routing was customized",
  },
  {
    long: "--continue-at",
    short: "-C",
    takesValue: true,
    disposition: "process",
  },
  { long: "--cookie", short: "-b", takesValue: true, disposition: "supported" },
  {
    long: "--cookie-jar",
    short: "-c",
    takesValue: true,
    disposition: "process",
  },
  { long: "--create-dirs", disposition: "process" },
  { long: "--create-file-mode", takesValue: true, disposition: "process" },
  { long: "--crlf", disposition: "protocol" },
  {
    long: "--crlfile",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--curves",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  { long: "--data", short: "-d", takesValue: true, disposition: "supported" },
  { long: "--data-ascii", takesValue: true, disposition: "supported" },
  { long: "--data-binary", takesValue: true, disposition: "supported" },
  { long: "--data-raw", takesValue: true, disposition: "supported" },
  { long: "--data-urlencode", takesValue: true, disposition: "supported" },
  { long: "--delegation", takesValue: true, disposition: "protocol" },
  {
    long: "--digest",
    disposition: "unrepresentable",
    reason: "digest authentication requires a server challenge",
  },
  { long: "--disable", short: "-q", disposition: "process" },
  { long: "--disable-eprt", disposition: "protocol" },
  { long: "--disable-epsv", disposition: "protocol" },
  { long: "--disallow-username-in-url", disposition: "process" },
  {
    long: "--dns-interface",
    takesValue: true,
    disposition: "warn",
    reason: "connection routing was customized",
  },
  {
    long: "--dns-ipv4-addr",
    takesValue: true,
    disposition: "warn",
    reason: "connection routing was customized",
  },
  {
    long: "--dns-ipv6-addr",
    takesValue: true,
    disposition: "warn",
    reason: "connection routing was customized",
  },
  {
    long: "--dns-servers",
    takesValue: true,
    disposition: "warn",
    reason: "connection routing was customized",
  },
  {
    long: "--doh-cert-status",
    disposition: "warn",
    reason: "certificate verification was relaxed",
  },
  {
    long: "--doh-insecure",
    disposition: "warn",
    reason: "certificate verification was relaxed",
  },
  {
    long: "--doh-url",
    takesValue: true,
    disposition: "warn",
    reason: "connection routing was customized",
  },
  {
    long: "--dump-header",
    short: "-D",
    takesValue: true,
    disposition: "process",
  },
  { long: "--egd-file", takesValue: true, disposition: "protocol" },
  { long: "--engine", takesValue: true, disposition: "protocol" },
  {
    long: "--etag-compare",
    takesValue: true,
    disposition: "unrepresentable",
    reason: "the entity tag would have to be read from a file",
  },
  {
    long: "--etag-save",
    takesValue: true,
    disposition: "unrepresentable",
    reason: "it writes the entity tag to a file",
  },
  { long: "--expect100-timeout", takesValue: true, disposition: "process" },
  { long: "--fail", short: "-f", disposition: "process" },
  { long: "--fail-early", disposition: "process" },
  { long: "--fail-with-body", disposition: "process" },
  {
    long: "--false-start",
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  { long: "--form", short: "-F", takesValue: true, disposition: "supported" },
  {
    long: "--form-escape",
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  { long: "--form-string", takesValue: true, disposition: "supported" },
  { long: "--ftp-account", takesValue: true, disposition: "protocol" },
  {
    long: "--ftp-alternative-to-user",
    takesValue: true,
    disposition: "protocol",
  },
  { long: "--ftp-create-dirs", disposition: "protocol" },
  { long: "--ftp-method", takesValue: true, disposition: "protocol" },
  { long: "--ftp-pasv", disposition: "protocol" },
  {
    long: "--ftp-port",
    short: "-P",
    takesValue: true,
    disposition: "protocol",
  },
  { long: "--ftp-pret", disposition: "protocol" },
  { long: "--ftp-skip-pasv-ip", disposition: "protocol" },
  { long: "--ftp-ssl-ccc", disposition: "protocol" },
  { long: "--ftp-ssl-ccc-mode", takesValue: true, disposition: "protocol" },
  { long: "--ftp-ssl-control", disposition: "protocol" },
  { long: "--get", short: "-G", disposition: "supported" },
  { long: "--globoff", short: "-g", disposition: "process" },
  {
    long: "--happy-eyeballs-timeout-ms",
    takesValue: true,
    disposition: "process",
  },
  {
    long: "--haproxy-clientip",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--haproxy-protocol",
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  { long: "--head", short: "-I", disposition: "supported" },
  { long: "--header", short: "-H", takesValue: true, disposition: "supported" },
  { long: "--help", short: "-h", takesValue: true, disposition: "process" },
  { long: "--hostpubmd5", takesValue: true, disposition: "protocol" },
  { long: "--hostpubsha256", takesValue: true, disposition: "protocol" },
  {
    long: "--hsts",
    takesValue: true,
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  {
    long: "--http0.9",
    disposition: "warn",
    reason: "a specific HTTP version was requested",
  },
  {
    long: "--http1.0",
    short: "-0",
    disposition: "warn",
    reason: "a specific HTTP version was requested",
  },
  {
    long: "--http1.1",
    disposition: "warn",
    reason: "a specific HTTP version was requested",
  },
  {
    long: "--http2",
    disposition: "warn",
    reason: "a specific HTTP version was requested",
  },
  {
    long: "--http2-prior-knowledge",
    disposition: "warn",
    reason: "a specific HTTP version was requested",
  },
  {
    long: "--http3",
    disposition: "warn",
    reason: "a specific HTTP version was requested",
  },
  {
    long: "--http3-only",
    disposition: "warn",
    reason: "a specific HTTP version was requested",
  },
  {
    long: "--ignore-content-length",
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  { long: "--include", short: "-i", disposition: "process" },
  {
    long: "--insecure",
    short: "-k",
    disposition: "warn",
    reason: "certificate verification was relaxed",
  },
  {
    long: "--interface",
    takesValue: true,
    disposition: "warn",
    reason: "connection routing was customized",
  },
  { long: "--ipfs-gateway", takesValue: true, disposition: "protocol" },
  { long: "--ipv4", short: "-4", disposition: "process" },
  { long: "--ipv6", short: "-6", disposition: "process" },
  { long: "--json", takesValue: true, disposition: "supported" },
  { long: "--junk-session-cookies", short: "-j", disposition: "process" },
  {
    long: "--keepalive-time",
    takesValue: true,
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  {
    long: "--key",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--key-type",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  { long: "--krb", takesValue: true, disposition: "protocol" },
  { long: "--libcurl", takesValue: true, disposition: "process" },
  { long: "--limit-rate", takesValue: true, disposition: "process" },
  { long: "--list-only", short: "-l", disposition: "protocol" },
  {
    long: "--local-port",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  { long: "--location", short: "-L", disposition: "supported" },
  { long: "--location-trusted", disposition: "supported" },
  { long: "--login-options", takesValue: true, disposition: "protocol" },
  { long: "--mail-auth", takesValue: true, disposition: "protocol" },
  { long: "--mail-from", takesValue: true, disposition: "protocol" },
  { long: "--mail-rcpt", takesValue: true, disposition: "protocol" },
  { long: "--mail-rcpt-allowfails", disposition: "protocol" },
  { long: "--manual", short: "-M", disposition: "process" },
  { long: "--max-filesize", takesValue: true, disposition: "process" },
  { long: "--max-redirs", takesValue: true, disposition: "process" },
  { long: "--max-time", short: "-m", takesValue: true, disposition: "process" },
  { long: "--metalink", disposition: "protocol" },
  {
    long: "--negotiate",
    disposition: "unrepresentable",
    reason: "SPNEGO authentication requires a server challenge",
  },
  {
    long: "--netrc",
    short: "-n",
    disposition: "unrepresentable",
    reason: "credentials would have to be read from a .netrc file",
  },
  {
    long: "--netrc-file",
    takesValue: true,
    disposition: "unrepresentable",
    reason: "credentials would have to be read from a .netrc file",
  },
  {
    long: "--netrc-optional",
    disposition: "unrepresentable",
    reason: "credentials would have to be read from a .netrc file",
  },
  {
    long: "--next",
    short: "-:",
    disposition: "unrepresentable",
    reason: "it describes more than one request in a single command",
  },
  {
    long: "--no-alpn",
    disposition: "warn",
    reason: "a specific HTTP version was requested",
  },
  { long: "--no-buffer", short: "-N", disposition: "process" },
  { long: "--no-clobber", disposition: "process" },
  { long: "--no-keepalive", disposition: "process" },
  {
    long: "--no-npn",
    disposition: "warn",
    reason: "a specific HTTP version was requested",
  },
  { long: "--no-progress-meter", disposition: "process" },
  { long: "--no-sessionid", disposition: "process" },
  {
    long: "--noproxy",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--ntlm",
    disposition: "unrepresentable",
    reason: "NTLM authentication requires a server challenge",
  },
  {
    long: "--ntlm-wb",
    disposition: "unrepresentable",
    reason: "NTLM authentication requires a server challenge",
  },
  { long: "--oauth2-bearer", takesValue: true, disposition: "supported" },
  { long: "--output", short: "-o", takesValue: true, disposition: "process" },
  { long: "--output-dir", takesValue: true, disposition: "process" },
  { long: "--parallel", short: "-Z", disposition: "process" },
  { long: "--parallel-immediate", disposition: "process" },
  { long: "--parallel-max", takesValue: true, disposition: "process" },
  { long: "--pass", takesValue: true, disposition: "protocol" },
  {
    long: "--path-as-is",
    disposition: "warn",
    reason: "connection routing was customized",
  },
  {
    long: "--pinnedpubkey",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--post301",
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  {
    long: "--post302",
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  {
    long: "--post303",
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  {
    long: "--preproxy",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  { long: "--progress-bar", short: "-#", disposition: "process" },
  {
    long: "--proto",
    takesValue: true,
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  {
    long: "--proto-default",
    takesValue: true,
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  {
    long: "--proto-redir",
    takesValue: true,
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  {
    long: "--proxy",
    short: "-x",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-anyauth",
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-basic",
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-ca-native",
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-cacert",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-capath",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-cert",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-cert-type",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-ciphers",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-crlfile",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-digest",
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-header",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-http2",
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-insecure",
    disposition: "warn",
    reason: "certificate verification was relaxed",
  },
  {
    long: "--proxy-key",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-key-type",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-negotiate",
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-ntlm",
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-pass",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-pinnedpubkey",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-service-name",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-ssl-allow-beast",
    disposition: "warn",
    reason: "certificate verification was relaxed",
  },
  {
    long: "--proxy-ssl-auto-client-cert",
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-tls13-ciphers",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-tlsauthtype",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-tlspassword",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-tlsuser",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-tlsv1",
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy-user",
    short: "-U",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxy1.0",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--proxytunnel",
    short: "-p",
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  { long: "--pubkey", takesValue: true, disposition: "protocol" },
  { long: "--quote", short: "-Q", takesValue: true, disposition: "protocol" },
  { long: "--random-file", takesValue: true, disposition: "protocol" },
  { long: "--range", short: "-r", takesValue: true, disposition: "supported" },
  { long: "--rate", takesValue: true, disposition: "process" },
  { long: "--raw", disposition: "process" },
  {
    long: "--referer",
    short: "-e",
    takesValue: true,
    disposition: "supported",
  },
  { long: "--remote-header-name", short: "-J", disposition: "process" },
  { long: "--remote-name", short: "-O", disposition: "process" },
  { long: "--remote-name-all", disposition: "process" },
  { long: "--remote-time", short: "-R", disposition: "process" },
  { long: "--remove-on-error", disposition: "process" },
  {
    long: "--request",
    short: "-X",
    takesValue: true,
    disposition: "supported",
  },
  {
    long: "--request-target",
    takesValue: true,
    disposition: "unrepresentable",
    reason: "it replaces the request target independently of the URL",
  },
  {
    long: "--resolve",
    takesValue: true,
    disposition: "warn",
    reason: "connection routing was customized",
  },
  { long: "--retry", takesValue: true, disposition: "process" },
  { long: "--retry-all-errors", disposition: "process" },
  { long: "--retry-connrefused", disposition: "process" },
  { long: "--retry-delay", takesValue: true, disposition: "process" },
  { long: "--retry-max-time", takesValue: true, disposition: "process" },
  { long: "--sasl-authzid", takesValue: true, disposition: "protocol" },
  { long: "--sasl-ir", disposition: "protocol" },
  {
    long: "--service-name",
    takesValue: true,
    disposition: "unrepresentable",
    reason: "SPNEGO authentication requires a server challenge",
  },
  { long: "--show-error", short: "-S", disposition: "process" },
  { long: "--silent", short: "-s", disposition: "process" },
  {
    long: "--socks4",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--socks4a",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--socks5",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--socks5-basic",
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  { long: "--socks5-gssapi", disposition: "protocol" },
  { long: "--socks5-gssapi-nec", disposition: "protocol" },
  {
    long: "--socks5-gssapi-service",
    takesValue: true,
    disposition: "protocol",
  },
  {
    long: "--socks5-hostname",
    takesValue: true,
    disposition: "warn",
    reason: "the request was routed through a proxy",
  },
  {
    long: "--speed-limit",
    short: "-Y",
    takesValue: true,
    disposition: "process",
  },
  {
    long: "--speed-time",
    short: "-y",
    takesValue: true,
    disposition: "process",
  },
  {
    long: "--ssl",
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--ssl-allow-beast",
    disposition: "warn",
    reason: "certificate verification was relaxed",
  },
  {
    long: "--ssl-auto-client-cert",
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--ssl-no-revoke",
    disposition: "warn",
    reason: "certificate verification was relaxed",
  },
  { long: "--ssl-reqd", disposition: "protocol" },
  {
    long: "--ssl-revoke-best-effort",
    disposition: "warn",
    reason: "certificate verification was relaxed",
  },
  {
    long: "--sslv2",
    short: "-2",
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--sslv3",
    short: "-3",
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  { long: "--stderr", takesValue: true, disposition: "process" },
  { long: "--styled-output", disposition: "process" },
  {
    long: "--suppress-connect-headers",
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  {
    long: "--tcp-fastopen",
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  { long: "--tcp-nodelay", disposition: "process" },
  {
    long: "--telnet-option",
    short: "-t",
    takesValue: true,
    disposition: "protocol",
  },
  { long: "--tftp-blksize", takesValue: true, disposition: "protocol" },
  { long: "--tftp-no-options", disposition: "protocol" },
  {
    long: "--time-cond",
    short: "-z",
    takesValue: true,
    disposition: "supported",
  },
  {
    long: "--tls-max",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--tls13-ciphers",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--tlsauthtype",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--tlspassword",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--tlsuser",
    takesValue: true,
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--tlsv1",
    short: "-1",
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--tlsv1.0",
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--tlsv1.1",
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--tlsv1.2",
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--tlsv1.3",
    disposition: "warn",
    reason: "TLS negotiation was customized",
  },
  {
    long: "--tr-encoding",
    disposition: "warn",
    reason: "transfer behaviour was customized",
  },
  { long: "--trace", takesValue: true, disposition: "process" },
  { long: "--trace-ascii", takesValue: true, disposition: "process" },
  { long: "--trace-config", takesValue: true, disposition: "process" },
  { long: "--trace-ids", disposition: "process" },
  { long: "--trace-time", disposition: "process" },
  {
    long: "--unix-socket",
    takesValue: true,
    disposition: "warn",
    reason: "connection routing was customized",
  },
  {
    long: "--upload-file",
    short: "-T",
    takesValue: true,
    disposition: "supported",
  },
  { long: "--url", takesValue: true, disposition: "supported" },
  { long: "--url-query", takesValue: true, disposition: "supported" },
  { long: "--use-ascii", short: "-B", disposition: "protocol" },
  { long: "--user", short: "-u", takesValue: true, disposition: "supported" },
  {
    long: "--user-agent",
    short: "-A",
    takesValue: true,
    disposition: "supported",
  },
  {
    long: "--variable",
    takesValue: true,
    disposition: "unrepresentable",
    reason: "it expands variables from the environment or a file at run time",
  },
  { long: "--verbose", short: "-v", disposition: "process" },
  { long: "--version", short: "-V", disposition: "process" },
  {
    long: "--write-out",
    short: "-w",
    takesValue: true,
    disposition: "process",
  },
  { long: "--xattr", disposition: "process" },
];

/** Lookup by long name and by short alias, built once. */
export const CURL_OPTION_INDEX: ReadonlyMap<string, CurlOptionSpec> = new Map(
  CURL_OPTIONS.flatMap((option) =>
    option.short === undefined
      ? [[option.long, option] as const]
      : [[option.long, option] as const, [option.short, option] as const],
  ),
);
