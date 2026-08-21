// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supportedTargets } from "curltocode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Derived so registering a language cannot leave this assertion behind. */
const LANGUAGE_COUNT = new Set(supportedTargets.map(({ language }) => language))
  .size;

import Converter from "../src/components/Converter";

const writeText = vi.fn<(value: string) => Promise<void>>();
const readText = vi.fn<() => Promise<string>>();
const valueOf = (label: string): string =>
  (screen.getByLabelText(label) as HTMLTextAreaElement).value;
type User = ReturnType<typeof userEvent.setup>;

async function chooseTarget(
  user: User,
  label: "Language" | "Client" | "Library",
  value: string,
): Promise<void> {
  const trigger = screen.getByRole("combobox", { name: label });
  if (trigger.getAttribute("data-value") === value) return;
  trigger.focus();
  await user.keyboard("{Enter}");
  await screen.findByRole("listbox");
  const targetIndex = screen
    .getAllByRole("option")
    .findIndex((option) => option.getAttribute("data-value") === value);
  if (targetIndex < 0) throw new Error(`Unknown option ${value}.`);
  await user.keyboard(`{Home}${"{ArrowDown}".repeat(targetIndex)}{Enter}`);
  expect(trigger).toHaveAttribute("data-value", value);
}

beforeEach(() => {
  writeText.mockResolvedValue(undefined);
  readText.mockResolvedValue("");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText, readText },
  });
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Converter", () => {
  it("converts the initial cURL and exposes its parsed request", async () => {
    render(<Converter />);
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain("await fetch"),
    );
    expect(screen.getByText("Request inspector")).toBeInTheDocument();
    expect(screen.getByText("POST")).toBeInTheDocument();
    expect(screen.getByText("page")).toBeInTheDocument();
  });

  it("switches language and client using accessible controls", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    await chooseTarget(user, "Language", "python");
    expect(screen.getByLabelText("Client")).toHaveAttribute(
      "data-value",
      "requests",
    );
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain("requests.post"),
    );
    await chooseTarget(user, "Client", "httpx");
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain("httpx.post"),
    );
  });

  it("supports keyboard opening, typeahead selection, and focus return", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    const language = screen.getByRole("combobox", { name: "Language" });

    language.focus();
    await user.keyboard("{Enter}py{Enter}");

    expect(language).toHaveAttribute("data-value", "python");
    expect(language).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows icons in selected values and every menu option", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    const converter = screen.getByLabelText("cURL and code converter");

    expect(
      converter.querySelector('[data-icon="language-javascript"]'),
    ).toBeInTheDocument();
    expect(
      converter.querySelector('[data-icon="client-fetch"]'),
    ).toBeInTheDocument();

    const languageSelect = screen.getByRole("combobox", {
      name: "Language",
    });
    languageSelect.focus();
    await user.keyboard("{Enter}");
    const pythonOption = await screen.findByRole("option", { name: "Python" });
    expect(
      pythonOption.querySelector('[data-icon="language-python"]'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(LANGUAGE_COUNT);
    await user.keyboard("py{Enter}");
    expect(
      converter.querySelector('[data-icon="language-python"]'),
    ).toBeInTheDocument();
    expect(
      converter.querySelector('[data-icon="client-requests"]'),
    ).toBeInTheDocument();

    const clientSelect = screen.getByRole("combobox", { name: "Client" });
    clientSelect.focus();
    await user.keyboard("{Enter}");
    const aiohttpOption = await screen.findByRole("option", {
      name: "aiohttp",
    });
    expect(
      aiohttpOption.querySelector('[data-icon="client-aiohttp"]'),
    ).toBeInTheDocument();
    await user.keyboard("ai{Enter}");
    expect(
      converter.querySelector('[data-icon="client-aiohttp"]'),
    ).toBeInTheDocument();
  });

  it.each([
    ["javascript", "fetch", "await fetch"],
    ["javascript", "axios", 'import axios from "axios"'],
    ["javascript", "undici", 'from "undici"'],
    ["typescript", "fetch", "satisfies RequestInit"],
    ["typescript", "axios", "satisfies AxiosRequestConfig"],
    ["typescript", "undici", 'from "undici"'],
    ["python", "requests", "requests.post"],
    ["python", "httpx", "httpx.post"],
    ["python", "aiohttp", "aiohttp.ClientSession"],
    ["go", "nethttp", "package main"],
    ["go", "resty", "resty.New()"],
    ["php", "curl", "curl_setopt_array"],
    ["php", "guzzle", "GuzzleHttp\\Client"],
    ["java", "httpclient", "HttpClient.newBuilder"],
    ["java", "okhttp", "OkHttpClient"],
    ["java", "apache", "HttpClients.custom"],
    ["csharp", "httpclient", "HttpRequestMessage"],
    ["csharp", "restsharp", "new RestClient"],
    ["ruby", "nethttp", "Net::HTTP::Post"],
    ["ruby", "faraday", "Faraday.new"],
    ["rust", "reqwest", "reqwest::Client"],
    ["rust", "ureq", "Agent::config_builder"],
  ] as const)(
    "generates %s/%s through the interactive selectors",
    async (language, client, expected) => {
      const user = userEvent.setup();
      render(<Converter />);
      await chooseTarget(user, "Language", language);
      await chooseTarget(user, "Client", client);
      expect(screen.getByLabelText("Client")).toHaveAttribute(
        "data-value",
        client,
      );
      await waitFor(() =>
        expect(valueOf("Converted output")).toContain(expected),
      );
    },
  );

  it("switches to reverse mode and lazy-parses static Fetch", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    await user.click(screen.getByRole("button", { name: "Code → cURL" }));
    expect(screen.getByLabelText("Language")).toHaveAttribute(
      "data-value",
      "auto",
    );
    expect(screen.queryByLabelText("Library")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain(
        "curl 'https://api.example.com/users'",
      ),
    );
    expect(screen.getByText("Detected Fetch.")).toBeInTheDocument();
  });

  it("reports invalid cURL and structured dynamic-code limitations", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    const input = screen.getByLabelText("cURL command");
    await user.clear(input);
    await user.type(input, "curl --netrc https://example.com");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "--netrc cannot be converted because credentials would have to be read from a .netrc file.",
    );
    await user.click(screen.getByRole("button", { name: "Code → cURL" }));
    const codeInput = screen.getByLabelText(
      "Request code in any supported language",
    );
    fireEvent.change(codeInput, {
      target: { value: "fetch(getApiUrl(), { headers: getHeaders() });" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dynamic URL cannot be resolved statically",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("getHeaders()");
  });

  it("copies only after an explicit click and clears input", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled(),
    );
    const clipboardWrite = vi.spyOn(navigator.clipboard, "writeText");
    expect(clipboardWrite).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(clipboardWrite).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Copied output to clipboard.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByLabelText("cURL command")).toHaveValue("");
    expect(screen.getByLabelText("Converted output")).toHaveValue("");
  });

  it("reports clipboard failures without losing generated output", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("clipboard blocked"),
    );
    await user.click(await screen.findByRole("button", { name: "Copy" }));
    expect(
      await screen.findByText(
        "Clipboard access failed. Select the output and copy it manually.",
      ),
    ).toBeVisible();
    expect(valueOf("Converted output")).toContain("fetch");
  });

  it("confirms a copy on the button itself, not only in the status line", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    const copy = await screen.findByRole("button", { name: "Copy" });
    expect(copy).not.toHaveAttribute("data-copied");
    await user.click(copy);
    const copied = await screen.findByRole("button", { name: "Copied" });
    expect(copied).toHaveAttribute("data-copied", "true");
  });

  // userEvent.setup() installs its own navigator.clipboard stub, so these spy
  // on the clipboard after setup rather than on the module-level mocks.
  it("copies with Ctrl+Enter without needing the button", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    render(<Converter />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled(),
    );
    expect(write).not.toHaveBeenCalled();
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[0]).toContain("fetch");
  });

  it("pastes the clipboard into the input and converts it", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "readText").mockResolvedValue(
      "curl 'https://api.example.com/pasted'",
    );
    render(<Converter />);
    await user.click(await screen.findByRole("button", { name: "Paste" }));
    await waitFor(() =>
      expect(valueOf("cURL command")).toBe(
        "curl 'https://api.example.com/pasted'",
      ),
    );
    expect(valueOf("Converted output")).toContain(
      "https://api.example.com/pasted",
    );
  });

  it("reports a refused clipboard read instead of silently doing nothing", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "readText").mockRejectedValue(
      new Error("denied"),
    );
    render(<Converter />);
    const before = valueOf("cURL command");
    await user.click(await screen.findByRole("button", { name: "Paste" }));
    expect(
      await screen.findByText(
        "Clipboard access was denied. Paste with your keyboard instead.",
      ),
    ).toBeVisible();
    expect(valueOf("cURL command")).toBe(before);
  });

  it("shows one reverse dropdown for auto-detect and reveals libraries for a language", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    expect(screen.getByRole("combobox", { name: "Language" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Code → cURL" }));
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveAttribute(
      "data-value",
      "auto",
    );
    expect(screen.queryByRole("combobox", { name: "Library" })).toBeNull();

    await chooseTarget(user, "Language", "typescript");
    expect(screen.getByRole("combobox", { name: "Library" })).toHaveAttribute(
      "data-value",
      "fetch",
    );
    await chooseTarget(user, "Library", "axios");
    expect(screen.getByRole("combobox", { name: "Library" })).toHaveAttribute(
      "data-value",
      "axios",
    );
  });

  it("keeps an SEO page's language and client in reverse mode", async () => {
    const user = userEvent.setup();
    render(
      <Converter
        initialLanguage="python"
        initialClient="httpx"
        reverseStrategy="selected-target"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Code → cURL" }));

    expect(screen.getByRole("combobox", { name: "Language" })).toHaveAttribute(
      "data-value",
      "python",
    );
    expect(screen.getByRole("combobox", { name: "Library" })).toHaveAttribute(
      "data-value",
      "httpx",
    );
    expect(valueOf("Python HTTPX request code")).toContain("import httpx");
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain(
        "curl 'https://api.example.com/users?page=1'",
      ),
    );
    expect(screen.getByText("Parsed as Python HTTPX.")).toBeVisible();
  });

  it("preselects the matching reverse parser on every forward page", async () => {
    // Every registered target now reads back, so a forward page opens Code to
    // cURL already pointed at its own language and library rather than falling
    // back to auto-detect.
    const user = userEvent.setup();
    render(
      <Converter
        initialLanguage="rust"
        initialClient="reqwest"
        reverseStrategy="selected-target"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Code → cURL" }));

    expect(screen.getByRole("combobox", { name: "Language" })).toHaveAttribute(
      "data-value",
      "rust",
    );
    expect(screen.getByRole("combobox", { name: "Library" })).toHaveAttribute(
      "data-value",
      "reqwest",
    );
    await waitFor(() =>
      // The reqwest example carries the page's query parameters, so match the
      // command prefix rather than a bare URL.
      expect(valueOf("Converted output")).toContain(
        "curl 'https://api.example.com/users",
      ),
    );
  });

  it("refuses code from a different client on a targeted SEO page", async () => {
    const user = userEvent.setup();
    render(
      <Converter
        initialLanguage="python"
        initialClient="httpx"
        reverseStrategy="selected-target"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Code → cURL" }));
    fireEvent.change(screen.getByLabelText("Python HTTPX request code"), {
      target: {
        value: 'requests.get("https://api.example.com/not-httpx")',
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Selected Python HTTPX, but the code uses Requests",
    );
    expect(valueOf("Converted output")).toBe("");
  });

  it("converts Python once the source language is chosen explicitly", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    await user.click(screen.getByRole("button", { name: "Code → cURL" }));
    fireEvent.change(
      screen.getByLabelText("Request code in any supported language"),
      {
        target: {
          value: `requests.get("https://api.example.com/py", headers={"Accept": "application/json"})`,
        },
      },
    );
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain(
        "curl 'https://api.example.com/py'",
      ),
    );
    expect(screen.getByText("Detected Requests.")).toBeInTheDocument();

    await chooseTarget(user, "Language", "python");
    expect(screen.getByRole("combobox", { name: "Library" })).toHaveAttribute(
      "data-value",
      "requests",
    );
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain(
        "curl 'https://api.example.com/py'",
      ),
    );
  });

  it("re-reads the same snippet when the source language changes", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    await user.click(screen.getByRole("button", { name: "Code → cURL" }));
    // The default snippet is JavaScript, so forcing Python must fail loudly
    // rather than quietly falling back to a parser that would succeed.
    await chooseTarget(user, "Language", "python");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /No supported Requests, HTTPX, aiohttp, urllib3, or http.client call was found/u,
    );
  });

  it("opens a reverse SEO page directly in its language and library", async () => {
    render(
      <Converter
        initialLanguage="typescript"
        initialClient="axios"
        initialMode="code-to-curl"
        reverseStrategy="selected-target"
      />,
    );

    expect(screen.getByRole("button", { name: "Code → cURL" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveAttribute(
      "data-value",
      "typescript",
    );
    expect(screen.getByRole("combobox", { name: "Library" })).toHaveAttribute(
      "data-value",
      "axios",
    );
    expect(valueOf("TypeScript Axios request code")).toContain(
      "AxiosRequestConfig",
    );
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain(
        "curl 'https://api.example.com/users?page=1'",
      ),
    );
  });

  it("visually masks secrets without mutating converter input or generated output", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    await waitFor(() =>
      expect(screen.getByText("Request inspector")).toBeInTheDocument(),
    );
    const inspector = screen
      .getByLabelText("cURL and code converter")
      .querySelector(".inspector");
    expect(inspector).not.toBeNull();
    if (inspector !== null) {
      expect(
        within(inspector as HTMLElement).getByText("••••••••"),
      ).toBeInTheDocument();
      expect(
        within(inspector as HTMLElement).queryByText("your-token"),
      ).not.toBeInTheDocument();
      expect(
        within(inspector as HTMLElement).getByText("Sensitive value hidden"),
      ).toBeVisible();

      const reveal = within(inspector as HTMLElement).getByRole("button", {
        name: "Reveal",
      });
      expect(reveal).toHaveAttribute("aria-pressed", "false");
      await user.click(reveal);

      expect(
        within(inspector as HTMLElement).getByText("Sensitive value visible"),
      ).toBeVisible();
      expect(
        within(inspector as HTMLElement).getByText("your-token"),
      ).toBeVisible();
      const hide = within(inspector as HTMLElement).getByRole("button", {
        name: "Hide",
      });
      expect(hide).toHaveAttribute("aria-pressed", "true");
      await user.click(hide);
      expect(
        within(inspector as HTMLElement).queryByText("your-token"),
      ).not.toBeInTheDocument();
    }
    expect(valueOf("cURL command")).toContain("your-token");
    expect(valueOf("Converted output")).toContain("your-token");
  });

  it("displays client dependency guidance", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    await chooseTarget(user, "Client", "axios");
    expect(await screen.findByText("npm install axios")).toBeInTheDocument();
    await chooseTarget(user, "Language", "python");
    expect(await screen.findByText("pip install requests")).toBeInTheDocument();
    await chooseTarget(user, "Language", "rust");
    expect(await screen.findByText(/reqwest = "0\.13"/u)).toBeInTheDocument();
    await chooseTarget(user, "Language", "java");
    await chooseTarget(user, "Client", "okhttp");
    expect(await screen.findByText(/okhttp:5\.3\.2/u)).toBeInTheDocument();
  });

  it("announces parser warnings separately from fatal errors", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    const input = screen.getByLabelText("cURL command");
    await user.clear(input);
    await user.type(input, "curl 'https://example.com/path#local-fragment'");
    const warning = await screen.findByRole("status");
    expect(warning).toHaveTextContent("Warning:");
    expect(warning).toHaveTextContent("URL fragments are not sent");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(valueOf("Converted output")).toContain("fetch");
  });

  it("shows effective implicit content types in the request inspector", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    const input = screen.getByLabelText("cURL command");
    await user.clear(input);
    await user.type(input, "curl https://example.com --data-raw name=Ada");
    expect(await screen.findByText("Content-Type (effective)")).toBeVisible();
    expect(screen.getByText("application/x-www-form-urlencoded")).toBeVisible();
  });

  it("masks URL credentials and sensitive query values only in the inspector", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    const input = screen.getByLabelText("cURL command");
    await user.clear(input);
    await user.type(
      input,
      "curl 'https://ada:super-secret@example.com/path?api_key=visible-source'",
    );
    const inspector = await screen.findByText("Request inspector");
    const region = inspector.closest(".inspector");
    expect(region).not.toBeNull();
    expect(region).not.toHaveTextContent("super-secret");
    expect(region).not.toHaveTextContent("visible-source");
    expect(region).toHaveTextContent("••••••••");
    expect(valueOf("cURL command")).toContain("super-secret");
    await chooseTarget(user, "Client", "axios");
    expect(valueOf("Converted output")).toContain("super-secret");
  });

  it("returns to masked values when the parsed request changes", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    const input = screen.getByLabelText("cURL command");
    const inspectorTitle = await screen.findByText("Request inspector");
    const inspector = inspectorTitle.closest(".inspector");
    expect(inspector).not.toBeNull();
    if (inspector === null) return;

    await user.click(
      within(inspector as HTMLElement).getByRole("button", { name: "Reveal" }),
    );
    expect(inspector).toHaveTextContent("your-token");

    await user.clear(input);
    await user.type(
      input,
      "curl https://example.com -H 'Authorization: Bearer replacement-token'",
    );

    await screen.findByText("Sensitive value hidden");
    const updatedInspector = screen
      .getByText("Request inspector")
      .closest(".inspector");
    expect(updatedInspector).not.toBeNull();
    expect(updatedInspector).not.toHaveTextContent("replacement-token");
    expect(updatedInspector).toHaveTextContent("••••••••");
  });

  it("never performs represented network requests", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network access is forbidden in this test"));
    const user = userEvent.setup();
    render(<Converter />);
    await waitFor(() => expect(valueOf("Converted output")).toContain("fetch"));
    await user.click(screen.getByRole("button", { name: "Code → cURL" }));
    await waitFor(() => expect(valueOf("Converted output")).toContain("curl"));
    expect(network).not.toHaveBeenCalled();
  });

  it("offers a picker when the input holds several cURL commands", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    fireEvent.change(screen.getByLabelText("cURL command"), {
      target: {
        value:
          "curl https://api.example.com/first\ncurl -X POST https://api.example.com/second",
      },
    });
    const picker = await screen.findByLabelText("2 cURL commands found");
    // The first command is what the output shows until another is chosen.
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain("/first"),
    );
    await user.selectOptions(picker, "1");
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain("/second"),
    );
    expect(valueOf("Converted output")).not.toContain("/first");
  });

  it("does not offer a picker for a single multi-line command", async () => {
    render(<Converter />);
    fireEvent.change(screen.getByLabelText("cURL command"), {
      target: {
        value:
          "curl https://api.example.com/one \\\n  --data-raw 'curl is mentioned here'",
      },
    });
    await waitFor(() => expect(valueOf("Converted output")).toContain("/one"));
    expect(
      screen.queryByRole("combobox", { name: /cURL commands found/u }),
    ).toBeNull();
  });

  it("lists every request in a pasted HAR archive", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    await user.click(screen.getByRole("button", { name: "Code → cURL" }));
    const har = JSON.stringify({
      log: {
        entries: [
          {
            request: {
              method: "GET",
              url: "https://api.example.com/first",
              headers: [],
              queryString: [],
            },
          },
          {
            request: {
              method: "DELETE",
              url: "https://api.example.com/second",
              headers: [],
              queryString: [],
            },
          },
        ],
      },
    });
    fireEvent.change(
      screen.getByLabelText("Request code in any supported language"),
      { target: { value: har } },
    );
    const picker = await screen.findByLabelText("2 requests in this document");
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain("/first"),
    );
    await user.selectOptions(picker, "1");
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain("/second"),
    );
  });

  it("copies a share link that keeps the request in the URL fragment", async () => {
    const user = userEvent.setup();
    // user-event installs its own clipboard stub, so the spy has to go on the
    // object it leaves behind rather than on the one set up beforehand.
    const write = vi.spyOn(navigator.clipboard, "writeText");
    render(<Converter />);
    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(write).toHaveBeenCalled());
    const link = write.mock.calls[0]?.[0] ?? "";
    // Everything after the # stays in the browser; a query string would be sent.
    expect(link).toContain("#s=");
    expect(new URL(link).search).toBe("");
    const payload = link.slice(link.indexOf("#s=") + 3);
    const decoded = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(payload.replaceAll("-", "+").replaceAll("_", "/")),
          (character) => character.codePointAt(0) ?? 0,
        ),
      ),
    ) as { i: string; l: string };
    expect(decoded.i).toContain("api.example.com");
    expect(decoded.l).toBe("javascript");
  });

  it("lifts secrets into shell variables when asked", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    await user.click(screen.getByRole("button", { name: "Code → cURL" }));
    fireEvent.change(
      screen.getByLabelText("Request code in any supported language"),
      {
        target: {
          value: `fetch("https://api.example.com/v1/me", {
  headers: { "X-Api-Key": "secret-key" },
});`,
        },
      },
    );
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain("secret-key"),
    );
    await user.click(screen.getByRole("checkbox", { name: /Secrets as/u }));
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain("$X_API_KEY"),
    );
    expect(valueOf("Converted output")).not.toContain("secret-key");
    // The value has to be shown somewhere, or the command cannot be run.
    expect(screen.getByText(/export X_API_KEY=/u)).toBeInTheDocument();
  });

  it("rejects oversized input before invoking conversion", async () => {
    render(<Converter />);
    fireEvent.change(screen.getByLabelText("cURL command"), {
      target: { value: "x".repeat(100_001) },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Input is too large",
    );
    expect(valueOf("Converted output")).toBe("");
  });
});
