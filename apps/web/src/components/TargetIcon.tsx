import type {
  GeneratorClient as Client,
  GeneratorLanguage as Language,
} from "curltocode";
import type { SimpleIcon } from "simple-icons";
import {
  siAiohttp,
  siApache,
  siAxios,
  siCurl,
  siDotnet,
  siGo,
  siJavascript,
  siOpenjdk,
  siPhp,
  siPython,
  siRuby,
  siRust,
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
  python: { type: "brand", icon: siPython },
  go: { type: "brand", icon: siGo },
  php: { type: "brand", icon: siPhp },
  java: { type: "brand", icon: siOpenjdk },
  csharp: { type: "brand", icon: siDotnet },
  ruby: { type: "brand", icon: siRuby },
  rust: { type: "brand", icon: siRust },
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
};

type TargetIconProps =
  | { readonly kind: "language"; readonly value: Language }
  | { readonly kind: "client"; readonly value: Client };

export default function TargetIcon(props: TargetIconProps) {
  const definition =
    props.kind === "language"
      ? languageIcons[props.value]
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
