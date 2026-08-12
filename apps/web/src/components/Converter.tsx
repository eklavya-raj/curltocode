import { useEffect, useMemo, useRef, useState } from "react";

import type {
  GeneratorClient as Client,
  GeneratorLanguage as Language,
  HttpRequest,
} from "curltocode";
import {
  generateDetailed,
  parseCode,
  parseCurlDetailed,
  requestToCurl,
  supportedTargets,
} from "curltocode";

import RequestInspector from "./RequestInspector";

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
  requests: "Requests",
  httpx: "HTTPX",
  nethttp: "net/http",
  curl: "cURL extension",
  httpclient: "HttpClient",
  okhttp: "OkHttp",
  reqwest: "reqwest",
};

const LANGUAGES = Array.from(
  new Set(supportedTargets.map(({ language }) => language)),
);

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

  const availableClients = useMemo(
    () => clientsForLanguage(language),
    [language],
  );

  useEffect(() => {
    rootRef.current?.setAttribute("data-ready", "true");
  }, []);

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
          status: `Detected ${parsed.client === "fetch" ? "Fetch" : "Axios"}.`,
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
  };

  const changeLanguage = (nextLanguage: Language): void => {
    setLanguage(nextLanguage);
    const firstClient = clientsForLanguage(nextLanguage)[0];
    if (firstClient !== undefined) setClient(firstClient);
  };

  const copyOutput = async (): Promise<void> => {
    if (output.length === 0) return;
    try {
      await navigator.clipboard.writeText(output);
      setFeedback("Copied output to clipboard.");
    } catch {
      setFeedback(
        "Clipboard access failed. Select the output and copy it manually.",
      );
    }
  };

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
              <label className="field">
                Language
                <select
                  value={language}
                  onChange={(event) =>
                    changeLanguage(event.target.value as Language)
                  }
                >
                  {LANGUAGES.map((entry) => (
                    <option value={entry} key={entry}>
                      {languageLabels[entry]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Client
                <select
                  value={client}
                  onChange={(event) => setClient(event.target.value as Client)}
                  disabled={availableClients.length < 2}
                >
                  {availableClients.map((entry) => (
                    <option value={entry} key={entry}>
                      {clientLabels[entry]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      </div>
      <div className="editor-grid">
        <div className="editor-pane">
          <div className="pane-header">
            <h2 className="pane-title">
              {mode === "curl-to-code" ? "cURL input" : "Code input"}
            </h2>
            <button
              className="action-button"
              type="button"
              onClick={() => {
                setInput("");
                setFeedback("");
              }}
              disabled={input.length === 0}
            >
              Clear
            </button>
          </div>
          <label className="sr-only" htmlFor="converter-input">
            {mode === "curl-to-code"
              ? "cURL command"
              : "JavaScript, TypeScript, or Axios request code"}
          </label>
          <textarea
            id="converter-input"
            className="editor"
            value={input}
            spellCheck={false}
            aria-describedby="converter-status"
            onChange={(event) => {
              setInput(event.target.value);
              setFeedback("");
            }}
          />
        </div>
        <div className="editor-pane">
          <div className="pane-header">
            <h2 className="pane-title">
              {mode === "curl-to-code" ? "Generated code" : "Generated cURL"}
            </h2>
            <button
              className="action-button"
              type="button"
              onClick={() => void copyOutput()}
              disabled={output.length === 0}
            >
              Copy
            </button>
          </div>
          <label className="sr-only" htmlFor="converter-output">
            Converted output
          </label>
          <textarea
            id="converter-output"
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
