/**
 * Split a shell script into the individual cURL commands it contains.
 *
 * People collect commands in a scratch file, a README, or a browser's
 * "Copy all as cURL", and converting them one at a time is tedious. Splitting
 * has to respect quoting: a body may contain the word `curl`, a newline, or an
 * unbalanced quote character, and none of those start a new command.
 */

/** True when the line, ignoring indentation, begins a cURL invocation. */
function startsCommand(line: string): boolean {
  return /^\s*curl(?:\s|$)/u.test(line);
}

export function splitCurlCommands(input: string): readonly string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;
  // Text before the first `curl` — a comment, a shell prompt, a heading —
  // introduces the command that follows rather than standing on its own.
  let started = false;

  const flush = (): void => {
    if (current.trim().length > 0) segments.push(current.trim());
    current = "";
    started = false;
  };

  const lines = input.split("\n");
  for (const line of lines) {
    // A newline only ends a command when nothing is left open across it.
    if (quote === undefined && !escaped && startsCommand(line)) {
      if (started) flush();
      started = true;
    }
    current += `${line}\n`;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quote === "'") {
        if (character === "'") quote = undefined;
        continue;
      }
      if (quote === '"') {
        if (character === "\\") escaped = true;
        else if (character === '"') quote = undefined;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
        continue;
      }
      // A comment runs to the end of the line and cannot open a quote.
      if (
        character === "#" &&
        (index === 0 || /\s/u.test(line[index - 1] ?? " "))
      ) {
        break;
      }
    }
    // A trailing backslash continues the command onto the next line; anything
    // else ends the line without ending the command.
    if (!escaped) escaped = false;
  }
  flush();
  return segments;
}
