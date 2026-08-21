import { quoteShell } from "../curl.js";

/**
 * Characters that carry no meaning to a POSIX shell in an unquoted argument.
 * `~` is excluded because a leading tilde expands, and `=` is safe only because
 * an argument is never the first word of a command here.
 */
const SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/u;

/**
 * Quote a command-line argument only when the shell would otherwise change its
 * meaning. Generated commands are meant to be read as well as run, and quoting
 * every token turns a legible HTTPie or Wget invocation into noise.
 */
export function shellArgument(value: string): string {
  return value.length > 0 && SAFE.test(value) ? value : quoteShell(value);
}

/**
 * Quote only the value half of a `prefix=value` or `Name:value` argument, which
 * is how these commands are written by hand: `--header='Accept: text/html'`
 * rather than `'--header=Accept: text/html'`.
 *
 * HTTP field names may contain `$`, `&`, `|`, and `*`, all of which the shell
 * acts on, so a prefix that is not itself safe falls back to quoting the whole
 * argument.
 */
export function shellOption(prefix: string, value: string): string {
  return SAFE.test(prefix)
    ? `${prefix}${shellArgument(value)}`
    : quoteShell(`${prefix}${value}`);
}
