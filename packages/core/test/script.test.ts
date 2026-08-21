import { describe, expect, it } from "vitest";

import { splitCurlCommands } from "../src/script.js";

describe("splitCurlCommands", () => {
  it("returns a single command unchanged", () => {
    expect(splitCurlCommands("curl https://api.example.com/one")).toEqual([
      "curl https://api.example.com/one",
    ]);
  });

  it("splits commands written on consecutive lines", () => {
    expect(
      splitCurlCommands(
        "curl https://api.example.com/one\ncurl https://api.example.com/two",
      ),
    ).toEqual([
      "curl https://api.example.com/one",
      "curl https://api.example.com/two",
    ]);
  });

  it("keeps a backslash continuation with its command", () => {
    const script = `curl https://api.example.com/one \\
  -H 'Accept: application/json'
curl https://api.example.com/two`;
    expect(splitCurlCommands(script)).toEqual([
      "curl https://api.example.com/one \\\n  -H 'Accept: application/json'",
      "curl https://api.example.com/two",
    ]);
  });

  it("does not split on the word curl inside a quoted body", () => {
    const script = `curl https://api.example.com/one --data-raw 'curl is a tool'`;
    expect(splitCurlCommands(script)).toEqual([script]);
  });

  it("does not split on a newline inside a quoted body", () => {
    const script = `curl https://hooks.example.com/events --data-raw 'first
curl second line'`;
    expect(splitCurlCommands(script)).toHaveLength(1);
  });

  it("ignores blank lines between commands", () => {
    expect(
      splitCurlCommands(
        "curl https://api.example.com/one\n\n\ncurl https://api.example.com/two\n",
      ),
    ).toEqual([
      "curl https://api.example.com/one",
      "curl https://api.example.com/two",
    ]);
  });

  it("returns nothing for input that contains no command", () => {
    expect(splitCurlCommands("   \n\n")).toEqual([]);
  });

  it("keeps leading text with the command that follows it", () => {
    // A pasted snippet may open with a shell prompt or a comment; it belongs to
    // the command it introduces rather than becoming a command of its own.
    expect(
      splitCurlCommands("# fetch the user\ncurl https://api.example.com/one"),
    ).toEqual(["# fetch the user\ncurl https://api.example.com/one"]);
  });
});
