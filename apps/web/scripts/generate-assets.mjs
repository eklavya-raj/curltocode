#!/usr/bin/env node
/**
 * Generate the social preview images and PWA icons in public/.
 *
 * Run manually with `node scripts/generate-assets.mjs` after adding a converter
 * page. Output is committed, so the production build needs no image tooling and
 * no new dependency. Requires `rsvg-convert` (librsvg) on the machine that runs
 * it.
 */
import { Buffer } from "node:buffer";
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

/**
 * Pack PNG frames into a classic `.ico`.
 *
 * A declared SVG icon is not enough on its own: browsers, crawlers, feed
 * readers, and bookmark managers still probe `/favicon.ico` directly, and
 * without one they receive the HTML 404 page instead of an image.
 *
 * Icon frames may be PNG-compressed rather than BMP, which is what keeps this
 * to a few lines of buffer arithmetic and no new dependency.
 */
function packIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // resource type: icon
  header.writeUInt16LE(frames.length, 4);

  const directory = Buffer.alloc(frames.length * 16);
  let offset = header.length + directory.length;
  frames.forEach((frame, index) => {
    const entry = index * 16;
    // A 256px frame is encoded as 0; nothing here is that large, but the
    // convention is worth respecting if a size is ever added.
    const dimension = frame.size >= 256 ? 0 : frame.size;
    directory.writeUInt8(dimension, entry);
    directory.writeUInt8(dimension, entry + 1);
    directory.writeUInt8(0, entry + 2); // palette entries: none, it is truecolour
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(frame.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += frame.data.length;
  });

  return Buffer.concat([
    header,
    directory,
    ...frames.map((frame) => frame.data),
  ]);
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
    heading: "cURL Converter",
    subtitle: "curl ↔ python · go · java · rust · php",
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

// 16 and 32 cover browser tabs and bookmarks; 48 is the size Google's crawler
// prefers when it picks a favicon for search results.
writeFileSync(
  join(publicDir, "favicon.ico"),
  packIco(
    [16, 32, 48].map((size) => {
      const framePath = join(publicDir, `.favicon-${size}.png`);
      rasterize(iconSvg(size), framePath, size, size);
      const data = readFileSync(framePath);
      rmSync(framePath);
      return { size, data };
    }),
  ),
);

process.stdout.write("Generated social images and icons in public/.\n");
