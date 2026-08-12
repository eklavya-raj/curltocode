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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Converter from "../src/components/Converter";

const writeText = vi.fn<(value: string) => Promise<void>>();
const valueOf = (label: string): string =>
  (screen.getByLabelText(label) as HTMLTextAreaElement).value;

beforeEach(() => {
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
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

  it("switches language and client using labeled keyboard-operable controls", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    await user.selectOptions(screen.getByLabelText("Language"), "python");
    expect(screen.getByLabelText("Client")).toHaveValue("requests");
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain("requests.post"),
    );
    await user.selectOptions(screen.getByLabelText("Client"), "httpx");
    await waitFor(() =>
      expect(valueOf("Converted output")).toContain("httpx.post"),
    );
  });

  it("shows icons for the selected language and client", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    const converter = screen.getByLabelText("cURL and code converter");

    expect(
      converter.querySelector('[data-icon="language-javascript"]'),
    ).toBeInTheDocument();
    expect(
      converter.querySelector('[data-icon="client-fetch"]'),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Language"), "python");
    expect(
      converter.querySelector('[data-icon="language-python"]'),
    ).toBeInTheDocument();
    expect(
      converter.querySelector('[data-icon="client-requests"]'),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Client"), "aiohttp");
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
      await user.selectOptions(screen.getByLabelText("Language"), language);
      await user.selectOptions(screen.getByLabelText("Client"), client);
      expect(screen.getByLabelText("Client")).toHaveValue(client);
      await waitFor(() =>
        expect(valueOf("Converted output")).toContain(expected),
      );
    },
  );

  it("switches to reverse mode and lazy-parses static Fetch", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    await user.click(screen.getByRole("button", { name: "Code → cURL" }));
    expect(screen.queryByLabelText("Language")).not.toBeInTheDocument();
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
    await user.type(input, "curl --compressed https://example.com");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unsupported cURL option: --compressed",
    );
    await user.click(screen.getByRole("button", { name: "Code → cURL" }));
    const codeInput = screen.getByLabelText(
      "JavaScript, TypeScript, or Axios request code",
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

  it("visually masks secrets without mutating converter input or generated output", async () => {
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
    }
    expect(valueOf("cURL command")).toContain("your-token");
    expect(valueOf("Converted output")).toContain("your-token");
  });

  it("displays client dependency guidance", async () => {
    const user = userEvent.setup();
    render(<Converter />);
    await user.selectOptions(screen.getByLabelText("Client"), "axios");
    expect(await screen.findByText("npm install axios")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Language"), "python");
    expect(await screen.findByText("pip install requests")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Language"), "rust");
    expect(await screen.findByText(/reqwest = "0\.13"/u)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Language"), "java");
    await user.selectOptions(screen.getByLabelText("Client"), "okhttp");
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
    await user.selectOptions(screen.getByLabelText("Client"), "axios");
    expect(valueOf("Converted output")).toContain("super-secret");
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
