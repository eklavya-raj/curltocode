import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  GeneratorClient as Client,
  GeneratorLanguage as Language,
  HttpRequest,
  ReverseClient,
  ReverseTarget,
  ReverseTargetLanguage,
} from "curltocode";
import {
  REVERSE_CLIENT_LABELS,
  generateDetailed,
  listRequests,
  parseCode,
  parseCurlDetailed,
  requestToCurlDetailed,
  splitCurlCommands,
  supportedReverseTargets,
  supportedTargets,
} from "curltocode";
import type { InterchangeEntry } from "curltocode";

import RequestInspector from "./RequestInspector";
import type { SourceLanguage } from "./TargetIcon";
import TargetSelect from "./TargetSelect";

type Mode = "curl-to-code" | "code-to-curl";

interface ConverterProps {
  readonly initialLanguage?: Language;
  readonly initialClient?: Client;
  readonly initialMode?: Mode;
  readonly reverseStrategy?: "auto-detect" | "selected-target";
}

interface ConversionState {
  readonly source: string;
  readonly output: string;
  readonly request?: HttpRequest;
  readonly error: string;
  readonly warning: string;
  readonly status: string;
  readonly parserKey?: string;
  /** Install command reported by the generator, when the client needs one. */
  readonly dependency?: string;
  /** Environment variables the generated cURL command expects. */
  readonly variables?: readonly {
    readonly name: string;
    readonly value: string;
  }[];
}

const MAX_INPUT_SIZE = 100_000;
/**
 * A share link carries the request in the URL fragment, which browsers never
 * send to a server. Past this length the URL stops being usable in a chat
 * message or an address bar, so it is refused rather than silently truncated.
 */
const MAX_SHARE_SIZE = 8000;

/** Encode a string as base64url, which survives a URL fragment unescaped. */
function encodeShare(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeShare(value: string): string | undefined {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(padded);
    const bytes = Uint8Array.from(
      binary,
      (character) => character.codePointAt(0) ?? 0,
    );
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

interface SharedState {
  readonly mode: Mode;
  readonly language: Language;
  readonly client: Client;
  readonly input: string;
}

/** Read a shared request out of the current URL fragment, if there is one. */
function readShare(): SharedState | undefined {
  if (typeof window === "undefined") return undefined;
  const hash = window.location.hash;
  if (!hash.startsWith("#s=")) return undefined;
  const decoded = decodeShare(hash.slice(3));
  if (decoded === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(decoded);
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as Record<string, unknown>;
    const input = record["i"];
    if (typeof input !== "string") return undefined;
    const mode =
      record["m"] === "code-to-curl" ? "code-to-curl" : "curl-to-code";
    const language = record["l"];
    const client = record["c"];
    return {
      mode,
      input,
      language: (typeof language === "string"
        ? language
        : "javascript") as Language,
      client: (typeof client === "string" ? client : "fetch") as Client,
    };
  } catch {
    return undefined;
  }
}
const DEFAULT_CURL = `curl 'https://api.example.com/users?page=1' \\
  -X POST \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer your-token' \\
  --data-raw '{"name":"Eklavya"}'`;
const DEFAULT_CODE = `fetch("https://api.example.com/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Eklavya" }),
});`;

const languageLabels: Record<Language, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  nodejs: "Node.js",
  python: "Python",
  go: "Go",
  php: "PHP",
  java: "Java",
  csharp: "C#",
  ruby: "Ruby",
  rust: "Rust",
  kotlin: "Kotlin",
  swift: "Swift",
  dart: "Dart",
  objectivec: "Objective-C",
  c: "C",
  cpp: "C++",
  clojure: "Clojure",
  elixir: "Elixir",
  perl: "Perl",
  r: "R",
  julia: "Julia",
  lua: "Lua",
  matlab: "MATLAB",
  ocaml: "OCaml",
  scala: "Scala",
  cfml: "CFML",
  nim: "Nim",
  crystal: "Crystal",
  powershell: "PowerShell",
  http: "HTTP",
  httpie: "HTTPie",
  wget: "Wget",
  har: "HAR",
  json: "JSON",
  ansible: "Ansible",
  postman: "Postman",
  k6: "k6",
};

const clientLabels: Record<Client, string> = {
  fetch: "Fetch",
  axios: "Axios",
  undici: "Undici",
  requests: "Requests",
  httpx: "HTTPX",
  aiohttp: "aiohttp",
  nethttp: "net/http",
  resty: "Resty",
  curl: "cURL extension",
  guzzle: "Guzzle",
  httpclient: "HttpClient",
  okhttp: "OkHttp",
  apache: "Apache HttpClient",
  restsharp: "RestSharp",
  faraday: "Faraday",
  reqwest: "reqwest",
  ureq: "ureq",
  urllib3: "urllib3",
  httpurlconnection: "HttpURLConnection",
  httparty: "HTTParty",
  restclient: "rest-client",
  symfony: "HttpClient",
  laravel: "HTTP client",
  flurl: "Flurl",
  got: "Got",
  ky: "Ky",
  superagent: "SuperAgent",
  https: "node:https",
  jquery: "jQuery",
  xhr: "XMLHttpRequest",
  ktor: "Ktor",
  urlsession: "URLSession",
  alamofire: "Alamofire",
  http: "package:http",
  dio: "Dio",
  nsurlsession: "NSURLSession",
  libcurl: "libcurl",
  cpr: "cpr",
  cljhttp: "clj-http",
  req: "Req",
  httpoison: "HTTPoison",
  lwp: "LWP::UserAgent",
  httr: "httr",
  httr2: "httr2",
  cohttp: "Cohttp",
  sttp: "sttp",
  cfhttp: "cfhttp",
  raw: "Raw request",
  cli: "command line",
  restmethod: "Invoke-RestMethod",
  webrequest: "Invoke-WebRequest",
  json: "1.2 archive",
  request: "request document",
  uri: "uri module",
  collection: "collection v2.1",
  script: "load test script",
};

/**
 * Source languages offered for an explicit choice, derived from the reverse
 * registry so a newly readable language cannot go missing from the menu. "Auto"
 * is first because detection is right for nearly every paste; the explicit
 * entries exist for the cases where a snippet is too short to classify, or is
 * deliberately being tested.
 */
const SOURCE_OPTIONS: readonly { label: string; value: SourceLanguage }[] = [
  { label: "Auto-detect", value: "auto" },
  ...Array.from(
    new Set(supportedReverseTargets.map(({ language }) => language)),
  ).map((value) => ({ label: languageLabels[value], value })),
];

const LANGUAGES = Array.from(
  new Set(supportedTargets.map(({ language }) => language)),
);

const LANGUAGE_OPTIONS = LANGUAGES.map((value) => ({
  label: languageLabels[value],
  value,
}));

function clientsForLanguage(language: Language): readonly Client[] {
  return supportedTargets
    .filter((target) => target.language === language)
    .map(({ client }) => client);
}

function messageForError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be converted.";
}

function targetLabel(language: Language, client: Client): string {
  return `${languageLabels[language]} ${clientLabels[client]}`;
}

function reverseTargetFor(
  language: Language,
  client: Client,
): ReverseTarget | undefined {
  return supportedReverseTargets.find(
    (target) => target.language === language && target.client === client,
  );
}

function reverseClientsForLanguage(
  language: ReverseTargetLanguage,
): readonly ReverseClient[] {
  return supportedReverseTargets
    .filter((target) => target.language === language)
    .map(({ client }) => client);
}

function isReverseClient(client: Client): client is ReverseClient {
  return supportedReverseTargets.some((target) => target.client === client);
}

/**
 * A one-line label for a cURL command in a picker.
 *
 * The URL is what tells two commands apart at a glance; the flags are what the
 * user is about to see converted anyway.
 */
function describeCommand(command: string): string {
  try {
    const request = parseCurlDetailed(command).request;
    const url = new URL(request.url);
    return `${request.method} ${url.host}${url.pathname}`;
  } catch {
    const condensed = command.replace(/\s+/gu, " ").trim();
    return condensed.length > 60 ? `${condensed.slice(0, 57)}…` : condensed;
  }
}

function defaultCodeForTarget(language: Language, client: Client): string {
  const request = parseCurlDetailed(DEFAULT_CURL).request;
  return generateDetailed(request, { language, client }).code;
}

export default function Converter({
  initialLanguage = "javascript",
  initialClient = "fetch",
  initialMode = "curl-to-code",
  reverseStrategy = "auto-detect",
}: ConverterProps) {
  const rootRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const initialClients = clientsForLanguage(initialLanguage);
  const safeInitialClient = initialClients.includes(initialClient)
    ? initialClient
    : (initialClients[0] ?? "fetch");
  const initialReverseTarget =
    reverseStrategy === "selected-target"
      ? reverseTargetFor(initialLanguage, safeInitialClient)
      : undefined;
  const initialReverseLanguage: SourceLanguage =
    initialReverseTarget?.language ?? "auto";
  const initialReverseClient: ReverseClient =
    initialReverseTarget?.client ?? "fetch";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [input, setInput] = useState(() =>
    initialMode === "curl-to-code"
      ? DEFAULT_CURL
      : initialReverseTarget === undefined
        ? DEFAULT_CODE
        : defaultCodeForTarget(
            initialReverseTarget.language,
            initialReverseTarget.client,
          ),
  );
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [client, setClient] = useState<Client>(safeInitialClient);
  const [reverseState, setReverseState] = useState<ConversionState>({
    source: "",
    output: "",
    error: "",
    warning: "",
    status: "",
  });
  const [feedback, setFeedback] = useState("");
  const [copied, setCopied] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>(
    initialReverseLanguage,
  );
  const [sourceClient, setSourceClient] =
    useState<ReverseClient>(initialReverseClient);
  // Which request to show when the input describes more than one: a script of
  // several cURL commands, or a HAR or Postman document. The choice is keyed to
  // the input it was made against, so a new input starts at the first request
  // without an effect having to reset it.
  const [selection, setSelection] = useState({ key: "", index: 0 });
  const [entries, setEntries] = useState<readonly InterchangeEntry[]>([]);
  // Off by default: a command you are about to run needs its values inline.
  const [liftSecrets, setLiftSecrets] = useState(false);

  /**
   * The cURL commands in the input. A scratch file or a browser's "copy all as
   * cURL" holds several, and splitting has to respect quoting, so the shared
   * splitter is used rather than a newline split.
   */
  const commands = useMemo(
    () =>
      mode === "curl-to-code" &&
      input.length > 0 &&
      input.length <= MAX_INPUT_SIZE
        ? splitCurlCommands(input)
        : [],
    [input, mode],
  );
  const selected = selection.key === input ? selection.index : 0;
  const setSelected = (index: number): void => {
    setSelection({ key: input, index });
  };
  const commandIndex =
    commands.length > 1 ? Math.min(selected, commands.length - 1) : 0;
  const activeInput =
    commands.length > 1 ? (commands[commandIndex] ?? input) : input;

  const availableClients = useMemo(
    () => clientsForLanguage(language),
    [language],
  );
  const availableClientOptions = useMemo(
    () =>
      availableClients.map((value) => ({
        label: clientLabels[value],
        value,
      })),
    [availableClients],
  );
  const availableSourceClients = useMemo(
    () =>
      sourceLanguage === "auto"
        ? []
        : reverseClientsForLanguage(sourceLanguage),
    [sourceLanguage],
  );
  const availableSourceClientOptions = useMemo(
    () =>
      availableSourceClients.map((value) => ({
        label: clientLabels[value],
        value,
      })),
    [availableSourceClients],
  );
  const selectedReverseTarget = useMemo(
    () =>
      sourceLanguage === "auto"
        ? undefined
        : supportedReverseTargets.find(
            (target) =>
              target.language === sourceLanguage &&
              target.client === sourceClient,
          ),
    [sourceClient, sourceLanguage],
  );
  const reverseParserKey = `${sourceLanguage}:${sourceClient}`;

  useEffect(() => {
    rootRef.current?.setAttribute("data-ready", "true");
    const shared = readShare();
    if (shared === undefined) return;
    // Applied after the hydration render rather than during it: the server had
    // no fragment to read, so changing state synchronously here would make the
    // first client render disagree with the markup it is hydrating.
    queueMicrotask(() => {
      setMode(shared.mode);
      setInput(shared.input);
      if (shared.mode === "curl-to-code") {
        setLanguage(shared.language);
        const clients = clientsForLanguage(shared.language);
        setClient(
          clients.includes(shared.client)
            ? shared.client
            : (clients[0] ?? "fetch"),
        );
      }
      setFeedback("Loaded a shared request from this link.");
    });
  }, []);

  /**
   * Requests inside a HAR archive or a Postman collection.
   *
   * A DevTools export routinely holds hundreds of entries, and converting only
   * the first would quietly answer a question nobody asked. The list is read
   * here so the picker can offer all of them.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (
        mode !== "code-to-curl" ||
        input.length === 0 ||
        input.length > MAX_INPUT_SIZE
      ) {
        if (!cancelled) setEntries([]);
        return;
      }
      try {
        const found = await listRequests(input);
        if (!cancelled) setEntries(found);
      } catch {
        if (!cancelled) setEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [input, mode]);

  // Only the input pane is resizable; mirroring its height onto the read-only
  // output keeps the two columns aligned and cannot feed back into itself.
  useEffect(() => {
    const source = inputRef.current;
    const target = outputRef.current;
    if (source === null || target === null) return;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      target.style.height = `${source.offsetHeight}px`;
    });
    observer.observe(source);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copied]);

  const forwardState = useMemo<ConversionState>(() => {
    if (mode !== "curl-to-code" || activeInput.length === 0) {
      return {
        source: input,
        output: "",
        error: "",
        warning: "",
        status: "",
      };
    }
    if (input.length > MAX_INPUT_SIZE) {
      return {
        source: input,
        output: "",
        error: `Input is too large. The current limit is ${MAX_INPUT_SIZE.toLocaleString()} characters.`,
        warning: "",
        status: "",
      };
    }
    try {
      const parsed = parseCurlDetailed(activeInput);
      const generated = generateDetailed(parsed.request, { language, client });
      return {
        source: input,
        output: generated.code,
        request: parsed.request,
        error: "",
        warning: parsed.warnings.map((warning) => warning.message).join("\n"),
        status: "",
        ...(generated.dependency === undefined
          ? {}
          : { dependency: generated.dependency }),
      };
    } catch (conversionError) {
      return {
        source: input,
        output: "",
        error: messageForError(conversionError),
        warning: "",
        status: "",
      };
    }
  }, [activeInput, client, input, language, mode]);

  useEffect(() => {
    if (mode !== "code-to-curl") return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (input.length === 0) {
        setReverseState({
          source: input,
          parserKey: reverseParserKey,
          output: "",
          error: "",
          warning: "",
          status: "",
        });
        return;
      }
      if (input.length > MAX_INPUT_SIZE) {
        setReverseState({
          source: input,
          parserKey: reverseParserKey,
          output: "",
          error: `Input is too large. The current limit is ${MAX_INPUT_SIZE.toLocaleString()} characters.`,
          warning: "",
          status: "",
        });
        return;
      }
      try {
        const parserLanguage =
          sourceLanguage === "auto"
            ? undefined
            : selectedReverseTarget?.parserLanguage;
        const parsed = await parseCode(input, parserLanguage);
        if (cancelled) return;
        if (sourceLanguage !== "auto" && parsed.client !== sourceClient) {
          setReverseState({
            source: input,
            parserKey: reverseParserKey,
            output: "",
            error: `Selected ${targetLabel(sourceLanguage, sourceClient)}, but the code uses ${REVERSE_CLIENT_LABELS[parsed.client]}. Choose the matching library or paste ${clientLabels[sourceClient]} code.`,
            warning: "",
            status: "",
          });
          return;
        }
        setReverseState({
          source: input,
          parserKey: reverseParserKey,
          request: parsed.request,
          ...(() => {
            const generated = requestToCurlDetailed(parsed.request, {
              secrets: liftSecrets ? "environment" : "inline",
            });
            return {
              output: generated.code,
              variables: generated.variables,
            };
          })(),
          error: "",
          warning: "",
          status:
            sourceLanguage !== "auto"
              ? `Parsed as ${targetLabel(sourceLanguage, sourceClient)}.`
              : `Detected ${REVERSE_CLIENT_LABELS[parsed.client]}.`,
        });
      } catch (conversionError) {
        if (cancelled) return;
        setReverseState({
          source: input,
          parserKey: reverseParserKey,
          output: "",
          error: messageForError(conversionError),
          warning: "",
          status: "",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    input,
    liftSecrets,
    mode,
    reverseParserKey,
    selectedReverseTarget,
    sourceClient,
    sourceLanguage,
  ]);

  const entryIndex =
    entries.length > 1 ? Math.min(selected, entries.length - 1) : 0;
  const chosenEntry = entries.length > 1 ? entries[entryIndex] : undefined;
  const chosenCurl =
    chosenEntry === undefined
      ? undefined
      : requestToCurlDetailed(chosenEntry.request, {
          secrets: liftSecrets ? "environment" : "inline",
        });

  const conversion =
    mode === "curl-to-code"
      ? forwardState
      : chosenEntry !== undefined && chosenCurl !== undefined
        ? {
            source: input,
            request: chosenEntry.request,
            output: chosenCurl.code,
            variables: chosenCurl.variables,
            error: "",
            warning: "",
            status: `Showing request ${entryIndex + 1} of ${entries.length}.`,
          }
        : reverseState.source === input &&
            reverseState.parserKey === reverseParserKey
          ? reverseState
          : {
              source: input,
              output: "",
              error: "",
              warning: "",
              status: "Loading the local AST parser…",
            };
  const { output, request, error, warning, variables } = conversion;
  const status = feedback || conversion.status;
  const dependency =
    mode === "curl-to-code" ? conversion.dependency : undefined;

  const switchMode = (nextMode: Mode): void => {
    let nextSourceLanguage = sourceLanguage;
    let nextSourceClient = sourceClient;
    if (nextMode === "code-to-curl" && reverseStrategy === "selected-target") {
      const currentTarget = reverseTargetFor(language, client);
      nextSourceLanguage = currentTarget?.language ?? "auto";
      nextSourceClient = currentTarget?.client ?? sourceClient;
      setSourceLanguage(nextSourceLanguage);
      setSourceClient(nextSourceClient);
    }
    setMode(nextMode);
    setInput(
      nextMode === "curl-to-code"
        ? DEFAULT_CURL
        : nextSourceLanguage === "auto"
          ? DEFAULT_CODE
          : defaultCodeForTarget(nextSourceLanguage, nextSourceClient),
    );
    setFeedback("");
    setCopied(false);
  };

  const changeLanguage = (nextLanguage: Language): void => {
    setLanguage(nextLanguage);
    const firstClient = clientsForLanguage(nextLanguage)[0];
    if (firstClient !== undefined) setClient(firstClient);
  };

  const changeSourceLanguage = (nextLanguage: SourceLanguage): void => {
    setSourceLanguage(nextLanguage);
    if (nextLanguage === "auto") return;
    const firstClient = reverseClientsForLanguage(nextLanguage)[0];
    if (firstClient !== undefined) setSourceClient(firstClient);
  };

  /**
   * Copy a link that carries the request in the URL fragment.
   *
   * The fragment is the one part of a URL a browser never sends to a server, so
   * a shared command stays between the people who have the link. Nothing is
   * uploaded and no short link is minted.
   */
  const copyShareLink = useCallback(async (): Promise<void> => {
    const payload = JSON.stringify({
      m: mode,
      l: language,
      c: client,
      i: input,
    });
    const encoded = encodeShare(payload);
    if (encoded.length > MAX_SHARE_SIZE) {
      setFeedback(
        "This request is too large to put in a link. Copy the command instead.",
      );
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}#s=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      setFeedback(
        "Copied a share link. The request travels in the URL fragment, which is never sent to a server.",
      );
    } catch {
      window.location.hash = `s=${encoded}`;
      setFeedback("Clipboard access failed. The link is in your address bar.");
    }
  }, [client, input, language, mode]);

  const copyOutput = useCallback(async (): Promise<void> => {
    if (output.length === 0) return;
    try {
      await navigator.clipboard.writeText(output);
      setFeedback("Copied output to clipboard.");
      setCopied(true);
    } catch {
      setFeedback(
        "Clipboard access failed. Select the output and copy it manually.",
      );
    }
  }, [output]);

  /**
   * Reading the clipboard is the awkward step on a phone, where selecting a
   * long command by hand is unpleasant. Permission may be refused, so failure
   * is reported rather than assumed away.
   */
  const pasteInput = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
      setFeedback("");
      setCopied(false);
    } catch {
      setFeedback(
        "Clipboard access was denied. Paste with your keyboard instead.",
      );
    }
  };

  // Ctrl/Cmd+Enter copies the output. Ctrl/Cmd+Shift+C is unavailable because
  // browsers bind it to developer tools.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Enter") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      void copyOutput();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [copyOutput]);

  /**
   * One control for the two ways an input can hold several requests. A script
   * of cURL commands and a HAR archive raise the same question — which one? —
   * so they are answered the same way rather than with two different widgets.
   */
  const picker =
    commands.length > 1
      ? {
          label: `${commands.length} cURL commands found`,
          index: commandIndex,
          options: commands.map(describeCommand),
        }
      : entries.length > 1
        ? {
            label: `${entries.length} requests in this document`,
            index: entryIndex,
            options: entries.map((entry) => entry.name),
          }
        : undefined;

  return (
    <section
      ref={rootRef}
      className="converter-card"
      aria-label="cURL and code converter"
    >
      <div className="converter-toolbar">
        <div
          className="mode-group"
          role="group"
          aria-label="Conversion direction"
        >
          <button
            className="mode-button"
            type="button"
            aria-pressed={mode === "curl-to-code"}
            onClick={() => switchMode("curl-to-code")}
          >
            cURL → Code
          </button>
          <button
            className="mode-button"
            type="button"
            aria-pressed={mode === "code-to-curl"}
            onClick={() => switchMode("code-to-curl")}
          >
            Code → cURL
          </button>
        </div>
        <div className="selectors">
          {mode === "curl-to-code" ? (
            <>
              <TargetSelect
                kind="language"
                label="Language"
                options={LANGUAGE_OPTIONS}
                value={language}
                onValueChange={changeLanguage}
              />
              <TargetSelect
                kind="client"
                label="Client"
                options={availableClientOptions}
                value={client}
                onValueChange={setClient}
                disabled={availableClients.length < 2}
              />
            </>
          ) : (
            <>
              <TargetSelect
                kind="source"
                label="Language"
                options={SOURCE_OPTIONS}
                value={sourceLanguage}
                onValueChange={changeSourceLanguage}
              />
              {sourceLanguage !== "auto" && (
                <TargetSelect
                  kind="client"
                  label="Library"
                  options={availableSourceClientOptions}
                  value={sourceClient}
                  onValueChange={(nextClient) => {
                    if (isReverseClient(nextClient)) {
                      setSourceClient(nextClient);
                    }
                  }}
                  disabled={availableSourceClients.length < 2}
                />
              )}
            </>
          )}
        </div>
      </div>
      <div className="editor-grid">
        <div className="editor-pane">
          <div className="pane-header">
            {/* A div, not a heading: the pane captions repeat on all 26 pages
                and would otherwise sit in every document outline. The textareas
                carry their own labels. */}
            <div className="pane-title">
              {mode === "curl-to-code" ? "cURL input" : "Code input"}
            </div>
            <div className="pane-actions">
              <button
                className="action-button"
                type="button"
                title="Copy a link containing this request"
                onClick={() => void copyShareLink()}
                disabled={input.length === 0}
              >
                Share
              </button>
              <button
                className="action-button"
                type="button"
                onClick={() => void pasteInput()}
              >
                Paste
              </button>
              <button
                className="action-button"
                type="button"
                onClick={() => {
                  setInput("");
                  setFeedback("");
                  setCopied(false);
                }}
                disabled={input.length === 0}
              >
                Clear
              </button>
            </div>
          </div>
          {picker !== undefined && (
            <div className="request-picker">
              <label htmlFor="converter-request">{picker.label}</label>
              <select
                id="converter-request"
                value={picker.index}
                onChange={(event) => setSelected(Number(event.target.value))}
              >
                {picker.options.map((option, index) => (
                  <option key={`${index}-${option}`} value={index}>
                    {index + 1}. {option}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="sr-only" htmlFor="converter-input">
            {mode === "curl-to-code"
              ? "cURL command"
              : sourceLanguage !== "auto"
                ? `${targetLabel(sourceLanguage, sourceClient)} request code`
                : "Request code in any supported language"}
          </label>
          <textarea
            id="converter-input"
            ref={inputRef}
            className="editor"
            value={input}
            spellCheck={false}
            aria-describedby="converter-status"
            onChange={(event) => {
              setInput(event.target.value);
              setFeedback("");
              setCopied(false);
            }}
          />
        </div>
        <div className="editor-pane">
          <div className="pane-header">
            <div className="pane-title">
              {mode === "curl-to-code" ? "Generated code" : "Generated cURL"}
            </div>
            <div className="pane-actions">
              {mode === "code-to-curl" && (
                <label className="secrets-toggle">
                  <input
                    type="checkbox"
                    checked={liftSecrets}
                    onChange={(event) => setLiftSecrets(event.target.checked)}
                  />
                  Secrets as variables
                </label>
              )}
              <button
                className="action-button"
                type="button"
                data-copied={copied ? "true" : undefined}
                title="Copy output (Ctrl+Enter)"
                onClick={() => void copyOutput()}
                disabled={output.length === 0}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <label className="sr-only" htmlFor="converter-output">
            Converted output
          </label>
          <textarea
            id="converter-output"
            ref={outputRef}
            className="editor"
            value={output}
            readOnly
            spellCheck={false}
            aria-describedby="converter-status"
          />
          {dependency !== undefined && output.length > 0 && (
            <p className="dependency-note">
              Install dependency: <code>{dependency}</code>
            </p>
          )}
          {variables !== undefined && variables.length > 0 && (
            <div className="dependency-note">
              <p>
                Set these before running the command. They are shown here and
                never sent anywhere.
              </p>
              <ul className="variable-list">
                {variables.map((variable) => (
                  <li key={variable.name}>
                    <code>
                      export {variable.name}={JSON.stringify(variable.value)}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {error.length > 0 ? (
        <p
          id="converter-status"
          className="status error"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </p>
      ) : warning.length > 0 ? (
        <p
          id="converter-status"
          className="status warning"
          role="status"
          aria-live="polite"
        >
          <strong>Warning:</strong> {warning}
        </p>
      ) : (
        <p id="converter-status" className="status" aria-live="polite">
          {status || "Conversion runs locally in this browser."}
        </p>
      )}
      {request !== undefined && <RequestInspector request={request} />}
    </section>
  );
}
