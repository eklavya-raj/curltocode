/**
 * A language-neutral static value.
 *
 * Every reverse parser resolves source expressions down to this shape before
 * anything is turned into a request. Keeping the model shared means body
 * classification, header assembly, and limitation reporting are written once
 * rather than re-derived, subtly differently, per language.
 */
export type StaticValue =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "null" }
  /** A bare name: an enum member, a constant, or a variable reference. */
  | { readonly kind: "identifier"; readonly name: string }
  | { readonly kind: "list"; readonly items: readonly StaticValue[] }
  | { readonly kind: "map"; readonly entries: readonly StaticEntry[] }
  /**
   * An expression whose value cannot be known without running the program.
   * `source` is the original text, so a limitation can quote it back.
   */
  | { readonly kind: "unresolved"; readonly source: string };

export interface StaticEntry {
  readonly key: StaticValue;
  readonly value: StaticValue;
}

export function isResolved(value: StaticValue): boolean {
  if (value.kind === "unresolved") return false;
  if (value.kind === "list") return value.items.every(isResolved);
  if (value.kind === "map") {
    return value.entries.every(
      (entry) => isResolved(entry.key) && isResolved(entry.value),
    );
  }
  return true;
}

/** Read a value as text, the way most client APIs would coerce it. */
export function asString(value: StaticValue): string | undefined {
  if (value.kind === "string") return value.value;
  if (value.kind === "number") return String(value.value);
  if (value.kind === "boolean") return value.value ? "true" : "false";
  return undefined;
}

export function asBoolean(value: StaticValue): boolean | undefined {
  if (value.kind === "boolean") return value.value;
  // Several ecosystems spell their literals as bare names.
  if (value.kind === "identifier") {
    const name = value.name.toLowerCase();
    if (name === "true") return true;
    if (name === "false") return false;
  }
  return undefined;
}

/**
 * Read a name/value mapping.
 *
 * Both a map and a list of two-item lists are accepted, because clients
 * disagree about which one represents headers, and a list form is what
 * preserves a repeated name.
 */
export function asPairs(
  value: StaticValue,
): readonly { readonly name: string; readonly value: string }[] | undefined {
  if (value.kind === "map") {
    const pairs: { name: string; value: string }[] = [];
    for (const entry of value.entries) {
      const name = asString(entry.key);
      const entryValue = asString(entry.value);
      if (name === undefined || entryValue === undefined) return undefined;
      pairs.push({ name, value: entryValue });
    }
    return pairs;
  }
  if (value.kind !== "list") return undefined;
  const pairs: { name: string; value: string }[] = [];
  for (const item of value.items) {
    if (item.kind === "string") {
      // A flat "Name: value" string, which is how cURL-style APIs take headers.
      const separator = item.value.indexOf(":");
      if (separator <= 0) return undefined;
      pairs.push({
        name: item.value.slice(0, separator).trim(),
        value: item.value.slice(separator + 1).trim(),
      });
      continue;
    }
    if (item.kind !== "list" || item.items.length !== 2) return undefined;
    const [first, second] = item.items;
    const name = first === undefined ? undefined : asString(first);
    const entryValue = second === undefined ? undefined : asString(second);
    if (name === undefined || entryValue === undefined) return undefined;
    pairs.push({ name, value: entryValue });
  }
  return pairs;
}

/** Find an entry in a map by key name, comparing case-insensitively. */
export function mapEntry(
  value: StaticValue,
  key: string,
): StaticValue | undefined {
  if (value.kind !== "map") return undefined;
  for (const entry of value.entries) {
    const name =
      entry.key.kind === "identifier" ? entry.key.name : asString(entry.key);
    if (name?.toLowerCase() === key.toLowerCase()) return entry.value;
  }
  return undefined;
}

/** The first unresolved expression inside a value, for error reporting. */
export function firstUnresolved(value: StaticValue): string | undefined {
  if (value.kind === "unresolved") return value.source;
  if (value.kind === "list") {
    for (const item of value.items) {
      const found = firstUnresolved(item);
      if (found !== undefined) return found;
    }
  }
  if (value.kind === "map") {
    for (const entry of value.entries) {
      const found = firstUnresolved(entry.key) ?? firstUnresolved(entry.value);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}
