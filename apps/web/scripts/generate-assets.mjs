#!/usr/bin/env node
/**
 * Generate the social preview images and PWA icons in public/.
 *
 * Run manually with `node scripts/generate-assets.mjs` after adding a converter
 * page. Output is committed, so the production build needs no image tooling and
 * no new dependency. Requires `rsvg-convert` (librsvg) on the machine that runs
 * it.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const ogDir = join(publicDir, "og");
const contentDir = join(root, "src", "content", "converters");

const INK = "#eef5ee";
const MUTED = "#a7b2a8";
const ACCENT = "#a3e635";
const BG = "#0d110e";
const PANEL = "#141a15";

const escapeXml = (value) =>
  value.replace(/[<>&"']/gu, (character) =>
    character === "<"
      ? "&lt;"
      : character === ">"
        ? "&gt;"
        : character === "&"
          ? "&amp;"
          : character === '"'
            ? "&quot;"
            : "&apos;",
  );

const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";
const MONO = "Menlo, Monaco, Consolas, monospace";

function wrapHeading(value, maximumCharacters = 24) {
  const lines = [];
  let current = "";
  for (const word of value.split(/\s+/u)) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (current !== "" && candidate.length > maximumCharacters) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

function ogSvg({ heading, subtitle }) {
  const headingLines = wrapHeading(heading);
  const headingStart = headingLines.length > 1 ? 286 : 330;
  const headingMarkup = headingLines
    .map(
      (line, index) =>
        `<tspan x="104" y="${headingStart + index * 76}">${escapeXml(line)}</tspan>`,
    )
    .join("");
  const subtitleY = headingLines.length > 1 ? 430 : 398;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${BG}"/>
  <rect x="52" y="52" width="1096" height="526" rx="28" fill="${PANEL}" stroke="#2d382f" stroke-width="2"/>
  <g transform="translate(104,132)">
    <path d="m18 20-9 12 9 12M46 20l9 12-9 12M38 12 26 52" fill="none" stroke="${ACCENT}" stroke-linecap="round" stroke-linejoin="round" stroke-width="6"/>
    <text x="78" y="46" font-family="${FONT}" font-size="30" font-weight="700" fill="${INK}">CurlToCode</text>
  </g>
  <text font-family="${FONT}" font-size="68" font-weight="700" fill="${INK}">${headingMarkup}</text>
  <text x="104" y="${subtitleY}" font-family="${MONO}" font-size="30" fill="${ACCENT}">${escapeXml(subtitle)}</text>
  <text x="104" y="500" font-family="${FONT}" font-size="26" fill="${MUTED}">Runs entirely in your browser. Nothing is uploaded.</text>
</svg>`;
}

/** The viewBox is fixed, so rasterizing at any size scales the same artwork. */
function iconSvg(size, maskable = false) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${maskable ? 0 : 14}" fill="#101511"/>
  <path d="m18 20-9 12 9 12M46 20l9 12-9 12M38 12 26 52" fill="none" stroke="${ACCENT}" stroke-linecap="round" stroke-linejoin="round" stroke-width="6"/>
</svg>`;
}

function rasterize(svg, outputPath, width, height) {
  const temporary = `${outputPath}.svg`;
  writeFileSync(temporary, svg);
  execFileSync("rsvg-convert", [
    temporary,
    "-w",
    String(width),
    "-h",
    String(height),
    "-o",
    outputPath,
  ]);
  rmSync(temporary);
}

/** Read slug/heading/clientLabel out of a content file's frontmatter. */
function readConverters(directory) {
  const results = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...readConverters(path));
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    const source = readFileSync(path, "utf8");
    const field = (name) =>
      new RegExp(`^${name}:\\s*(.+)$`, "mu").exec(source)?.[1]?.trim() ?? "";
    results.push({
      slug: field("slug"),
      heading: field("heading"),
      clientLabel: field("clientLabel"),
      languageLabel: field("languageLabel"),
    });
  }
  return results;
}

mkdirSync(ogDir, { recursive: true });

rasterize(
  ogSvg({
    heading: "cURL ↔ Code Converter",
    subtitle: "curl → python · go · java · rust · php",
  }),
  join(ogDir, "default.png"),
  1200,
  630,
);

for (const converter of readConverters(contentDir)) {
  if (converter.slug === "") continue;
  rasterize(
    ogSvg({
      heading: converter.heading,
      subtitle: `${converter.languageLabel} · ${converter.clientLabel}`,
    }),
    join(ogDir, `${converter.slug.replace("/", "-")}.png`),
    1200,
    630,
  );
}

rasterize(iconSvg(512), join(publicDir, "icon-512.png"), 512, 512);
rasterize(iconSvg(192), join(publicDir, "icon-192.png"), 192, 192);
rasterize(iconSvg(180), join(publicDir, "apple-touch-icon.png"), 180, 180);
rasterize(
  iconSvg(512, true),
  join(publicDir, "icon-maskable-512.png"),
  512,
  512,
);

process.stdout.write("Generated social images and icons in public/.\n");
