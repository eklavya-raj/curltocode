import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  GeneratorClient as Client,
  GeneratorLanguage as Language,
  HttpRequest,
} from "curltocode";
import {
  REVERSE_CLIENT_LABELS,
  generateDetailed,
  parseCode,
  parseCurlDetailed,
  requestToCurl,
  supportedTargets,
} from "curltocode";

import RequestInspector from "./RequestInspector";
import TargetSelect from "./TargetSelect";

type Mode = "curl-to-code" | "code-to-curl";

interface ConverterProps {
  readonly initialLanguage?: Language;
  readonly initialClient?: Client;
}

interface ConversionState {
  readonly source: string;
  readonly output: string;
  readonly request?: HttpRequest;
  readonly error: string;
  readonly warning: string;
  readonly status: string;
  /** Install command reported by the generator, when the client needs one. */
  readonly dependency?: string;
}

const MAX_INPUT_SIZE = 100_000;
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
  python: "Python",
  go: "Go",
  php: "PHP",
  java: "Java",
  csharp: "C#",
  ruby: "Ruby",
  rust: "Rust",
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
};

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

export default function Converter({
  initialLanguage = "javascript",
  initialClient = "fetch",
}: ConverterProps) {
  const rootRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const initialClients = clientsForLanguage(initialLanguage);
  const safeInitialClient = initialClients.includes(initialClient)
    ? initialClient
    : (initialClients[0] ?? "fetch");
  const [mode, setMode] = useState<Mode>("curl-to-code");
  const [input, setInput] = useState(DEFAULT_CURL);
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

  useEffect(() => {
    rootRef.current?.setAttribute("data-ready", "true");
  }, []);

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
    if (mode !== "curl-to-code" || input.length === 0) {
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
      const parsed = parseCurlDetailed(input);
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
  }, [client, input, language, mode]);

  useEffect(() => {
    if (mode !== "code-to-curl") return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (input.length === 0) {
        setReverseState({
          source: input,
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
          output: "",
          error: `Input is too large. The current limit is ${MAX_INPUT_SIZE.toLocaleString()} characters.`,
          warning: "",
          status: "",
        });
        return;
      }
      try {
        const parsed = await parseCode(input);
        if (cancelled) return;
        setReverseState({
          source: input,
          request: parsed.request,
          output: requestToCurl(parsed.request),
          error: "",
          warning: "",
          status: `Detected ${REVERSE_CLIENT_LABELS[parsed.client]}.`,
        });
      } catch (conversionError) {
        if (cancelled) return;
        setReverseState({
          source: input,
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
  }, [input, mode]);

  const conversion =
    mode === "curl-to-code"
      ? forwardState
      : reverseState.source === input
        ? reverseState
        : {
            source: input,
            output: "",
            error: "",
            warning: "",
            status: "Loading the local AST parser…",
          };
  const { output, request, error, warning } = conversion;
  const status = feedback || conversion.status;
  const dependency =
    mode === "curl-to-code" ? conversion.dependency : undefined;

  const switchMode = (nextMode: Mode): void => {
    setMode(nextMode);
    setInput(nextMode === "curl-to-code" ? DEFAULT_CURL : DEFAULT_CODE);
    setFeedback("");
    setCopied(false);
  };

  const changeLanguage = (nextLanguage: Language): void => {
    setLanguage(nextLanguage);
    const firstClient = clientsForLanguage(nextLanguage)[0];
    if (firstClient !== undefined) setClient(firstClient);
  };

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
          {mode === "curl-to-code" && (
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
          <label className="sr-only" htmlFor="converter-input">
            {mode === "curl-to-code"
              ? "cURL command"
              : "JavaScript, TypeScript, or Python request code"}
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
