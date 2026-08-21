import type {
  GeneratorClient as Client,
  GeneratorLanguage as Language,
  ReverseTargetLanguage,
} from "curltocode";
import type { SimpleIcon } from "simple-icons";
import {
  siAiohttp,
  siAnsible,
  siApache,
  siAxios,
  siApple,
  siC,
  siClojure,
  siCplusplus,
  siCrystal,
  siCurl,
  siDart,
  siDotnet,
  siElixir,
  siGnu,
  siGo,
  siGrafana,
  siHttpie,
  siJavascript,
  siJquery,
  siJson,
  siJulia,
  siKotlin,
  siLaravel,
  siLua,
  siNim,
  siNodedotjs,
  siOcaml,
  siOpenjdk,
  siPerl,
  siPhp,
  siPostman,
  siPython,
  siR,
  siRuby,
  siRust,
  siScala,
  siSwift,
  siSymfony,
  siTypescript,
} from "simple-icons";

interface BrandIcon {
  readonly type: "brand";
  readonly icon: SimpleIcon;
}

interface MonogramIcon {
  readonly type: "monogram";
  readonly text: string;
}

type IconDefinition = BrandIcon | MonogramIcon;

const languageIcons: Record<Language, IconDefinition> = {
  javascript: { type: "brand", icon: siJavascript },
  typescript: { type: "brand", icon: siTypescript },
  nodejs: { type: "brand", icon: siNodedotjs },
  python: { type: "brand", icon: siPython },
  go: { type: "brand", icon: siGo },
  php: { type: "brand", icon: siPhp },
  java: { type: "brand", icon: siOpenjdk },
  csharp: { type: "brand", icon: siDotnet },
  ruby: { type: "brand", icon: siRuby },
  rust: { type: "brand", icon: siRust },
  kotlin: { type: "brand", icon: siKotlin },
  swift: { type: "brand", icon: siSwift },
  dart: { type: "brand", icon: siDart },
  // Objective-C has no mark of its own; it is an Apple platform language.
  objectivec: { type: "brand", icon: siApple },
  c: { type: "brand", icon: siC },
  cpp: { type: "brand", icon: siCplusplus },
  clojure: { type: "brand", icon: siClojure },
  elixir: { type: "brand", icon: siElixir },
  perl: { type: "brand", icon: siPerl },
  r: { type: "brand", icon: siR },
  julia: { type: "brand", icon: siJulia },
  lua: { type: "brand", icon: siLua },
  // simple-icons carries no MATLAB mark.
  matlab: { type: "monogram", text: "ML" },
  ocaml: { type: "brand", icon: siOcaml },
  scala: { type: "brand", icon: siScala },
  // Neither ColdFusion nor Lucee has a mark in simple-icons.
  cfml: { type: "monogram", text: "CF" },
  nim: { type: "brand", icon: siNim },
  crystal: { type: "brand", icon: siCrystal },
  // simple-icons has no PowerShell mark, so the shell prompt stands in for it.
  powershell: { type: "monogram", text: "PS" },
  http: { type: "monogram", text: "H1" },
  httpie: { type: "brand", icon: siHttpie },
  // Wget has no mark of its own; it is a GNU tool, so the GNU head stands in.
  wget: { type: "brand", icon: siGnu },
  har: { type: "monogram", text: "HAR" },
  json: { type: "brand", icon: siJson },
  ansible: { type: "brand", icon: siAnsible },
  postman: { type: "brand", icon: siPostman },
  k6: { type: "brand", icon: siGrafana },
};

const clientIcons: Record<Client, IconDefinition> = {
  fetch: { type: "monogram", text: "F" },
  axios: { type: "brand", icon: siAxios },
  undici: { type: "monogram", text: "U" },
  requests: { type: "monogram", text: "Rq" },
  httpx: { type: "monogram", text: "Hx" },
  aiohttp: { type: "brand", icon: siAiohttp },
  nethttp: { type: "monogram", text: "H" },
  resty: { type: "monogram", text: "Ry" },
  curl: { type: "brand", icon: siCurl },
  guzzle: { type: "monogram", text: "Gz" },
  httpclient: { type: "monogram", text: "H" },
  okhttp: { type: "monogram", text: "Ok" },
  apache: { type: "brand", icon: siApache },
  restsharp: { type: "monogram", text: "Rs" },
  faraday: { type: "monogram", text: "Fr" },
  reqwest: { type: "monogram", text: "Rq" },
  ureq: { type: "monogram", text: "Ur" },
  urllib3: { type: "monogram", text: "U3" },
  httpurlconnection: { type: "monogram", text: "UC" },
  httparty: { type: "monogram", text: "HP" },
  restclient: { type: "monogram", text: "RC" },
  symfony: { type: "brand", icon: siSymfony },
  laravel: { type: "brand", icon: siLaravel },
  flurl: { type: "monogram", text: "Fl" },
  got: { type: "monogram", text: "Gt" },
  ky: { type: "monogram", text: "Ky" },
  superagent: { type: "monogram", text: "SA" },
  https: { type: "monogram", text: "N" },
  jquery: { type: "brand", icon: siJquery },
  xhr: { type: "monogram", text: "XHR" },
  ktor: { type: "monogram", text: "Kt" },
  urlsession: { type: "monogram", text: "US" },
  alamofire: { type: "monogram", text: "AF" },
  http: { type: "monogram", text: "H" },
  dio: { type: "monogram", text: "Di" },
  nsurlsession: { type: "monogram", text: "NS" },
  libcurl: { type: "brand", icon: siCurl },
  cpr: { type: "monogram", text: "cpr" },
  cljhttp: { type: "monogram", text: "cj" },
  req: { type: "monogram", text: "Rq" },
  httpoison: { type: "monogram", text: "HP" },
  lwp: { type: "monogram", text: "LWP" },
  httr: { type: "monogram", text: "ht" },
  httr2: { type: "monogram", text: "h2" },
  cohttp: { type: "monogram", text: "Co" },
  sttp: { type: "monogram", text: "st" },
  cfhttp: { type: "monogram", text: "CF" },
  raw: { type: "monogram", text: "H1" },
  cli: { type: "monogram", text: ">_" },
  restmethod: { type: "monogram", text: "RM" },
  webrequest: { type: "monogram", text: "WR" },
  json: { type: "monogram", text: "1.2" },
  request: { type: "monogram", text: "{}" },
  uri: { type: "monogram", text: "URI" },
  collection: { type: "monogram", text: "C" },
  script: { type: "monogram", text: "k6" },
};

/**
 * Reverse conversion reads a source language rather than targeting one. The
 * JavaScript AST parser also understands TypeScript syntax, but the UI keeps
 * the languages separate so an explicit selection reflects the pasted code.
 */
export type SourceLanguage = "auto" | ReverseTargetLanguage;

const sourceIcons: Record<SourceLanguage, IconDefinition> = {
  auto: { type: "monogram", text: "A" },
  javascript: { type: "brand", icon: siJavascript },
  nodejs: { type: "brand", icon: siNodedotjs },
  kotlin: { type: "brand", icon: siKotlin },
  swift: { type: "brand", icon: siSwift },
  dart: { type: "brand", icon: siDart },
  php: { type: "brand", icon: siPhp },
  go: { type: "brand", icon: siGo },
  java: { type: "brand", icon: siOpenjdk },
  csharp: { type: "brand", icon: siDotnet },
  ruby: { type: "brand", icon: siRuby },
  rust: { type: "brand", icon: siRust },
  typescript: { type: "brand", icon: siTypescript },
  python: { type: "brand", icon: siPython },
  http: { type: "monogram", text: "H1" },
  httpie: { type: "brand", icon: siHttpie },
  wget: { type: "brand", icon: siGnu },
  powershell: { type: "monogram", text: "PS" },
  har: { type: "monogram", text: "HAR" },
  postman: { type: "brand", icon: siPostman },
  json: { type: "brand", icon: siJson },
};

type TargetIconProps =
  | { readonly kind: "language"; readonly value: Language }
  | { readonly kind: "client"; readonly value: Client }
  | { readonly kind: "source"; readonly value: SourceLanguage };

export default function TargetIcon(props: TargetIconProps) {
  const definition =
    props.kind === "language"
      ? languageIcons[props.value]
      : props.kind === "source"
        ? sourceIcons[props.value]
        : clientIcons[props.value];

  return (
    <span
      className={`target-icon target-icon-${definition.type}`}
      data-icon={`${props.kind}-${props.value}`}
      aria-hidden="true"
    >
      {definition.type === "brand" ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d={definition.icon.path} />
        </svg>
      ) : (
        definition.text
      )}
    </span>
  );
}
