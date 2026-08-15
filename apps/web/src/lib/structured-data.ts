import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from "./site.js";

/**
 * JSON-LD emitted here is limited to types that still describe this site
 * accurately and are still consumed by search engines (AGENTS.md §44).
 *
 * Deliberately omitted:
 * - `HowTo`, whose rich result Google retired in 2023.
 * - `SearchAction`, whose sitelinks searchbox Google retired in 2024, and which
 *   this site could not honour anyway because it has no search endpoint.
 * - `AggregateRating`, which would require review data this site does not have.
 */

export interface BreadcrumbEntry {
  readonly name: string;
  readonly path: string;
}

export interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

export interface ItemListEntry {
  readonly name: string;
  readonly path: string;
}

export interface StructuredDataInput {
  readonly canonical: string;
  readonly title: string;
  readonly description: string;
  // `undefined` is spelled out because the workspace enables
  // exactOptionalPropertyTypes and callers forward optional Astro props.
  readonly breadcrumbs?: readonly BreadcrumbEntry[] | undefined;
  readonly faqs?: readonly FaqEntry[] | undefined;
  /** Ordered page listing, for index pages that enumerate other routes. */
  readonly itemList?: readonly ItemListEntry[] | undefined;
  /**
   * Set on pages whose body really is a technical reference document. This
   * makes the page eligible for article treatment, which a bare `WebPage`
   * is not.
   */
  readonly article?: ArticleInput | undefined;
}

export interface ArticleInput {
  readonly headline: string;
  /** Programming language the document is about, for `SoftwareSourceCode`. */
  readonly programmingLanguage?: string;
  /** A representative generated example from the page. */
  readonly codeSample?: string | undefined;
}

const WEBSITE_ID = `${SITE_URL}/#website`;
const ORGANIZATION_ID = `${SITE_URL}/#organization`;

function organization(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icon-512.png"),
      width: 512,
      height: 512,
    },
  };
}

function webSite(): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

function webPage(input: StructuredDataInput): Record<string, unknown> {
  return {
    "@type": "WebPage",
    "@id": `${input.canonical}#webpage`,
    url: input.canonical,
    name: input.title,
    description: input.description,
    isPartOf: { "@id": WEBSITE_ID },
    inLanguage: "en",
    ...(input.breadcrumbs === undefined || input.breadcrumbs.length === 0
      ? {}
      : { breadcrumb: { "@id": `${input.canonical}#breadcrumb` } }),
  };
}

function breadcrumbList(
  canonical: string,
  entries: readonly BreadcrumbEntry[],
): Record<string, unknown> {
  const completeEntries: readonly BreadcrumbEntry[] = [
    { name: "Home", path: "/" },
    ...entries,
  ];
  return {
    "@type": "BreadcrumbList",
    "@id": `${canonical}#breadcrumb`,
    itemListElement: completeEntries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: absoluteUrl(entry.path),
    })),
  };
}

function faqPage(
  canonical: string,
  faqs: readonly FaqEntry[],
): Record<string, unknown> {
  return {
    "@type": "FAQPage",
    "@id": `${canonical}#faq`,
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/**
 * Describes an index page's own listing. Useful only where the page really is
 * an enumeration of other pages, which is why it is opt-in per route.
 */
function itemList(
  canonical: string,
  entries: readonly ItemListEntry[],
): Record<string, unknown> {
  return {
    "@type": "ItemList",
    "@id": `${canonical}#itemlist`,
    numberOfItems: entries.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      url: absoluteUrl(entry.path),
    })),
  };
}

/**
 * A converter reference page is a technical article about one client library.
 *
 * `TechArticle` is used rather than plain `Article` because it is the type
 * that actually describes this content, and the embedded `SoftwareSourceCode`
 * names the language of the example the page is built around. Both are omitted
 * on pages that are navigation rather than documentation.
 */
function techArticle(
  input: StructuredDataInput,
  article: ArticleInput,
): Record<string, unknown> {
  return {
    "@type": "TechArticle",
    "@id": `${input.canonical}#article`,
    headline: article.headline,
    description: input.description,
    inLanguage: "en",
    isPartOf: { "@id": `${input.canonical}#webpage` },
    mainEntityOfPage: { "@id": `${input.canonical}#webpage` },
    author: { "@id": ORGANIZATION_ID },
    publisher: { "@id": ORGANIZATION_ID },
    ...(article.programmingLanguage === undefined
      ? {}
      : { proficiencyLevel: "Beginner" }),
    ...(article.codeSample === undefined ||
    article.programmingLanguage === undefined
      ? {}
      : {
          hasPart: {
            "@type": "SoftwareSourceCode",
            "@id": `${input.canonical}#code`,
            programmingLanguage: article.programmingLanguage,
            codeSampleType: "full solution",
            text: article.codeSample,
          },
        }),
  };
}

/**
 * Build a single `@graph` document so page entities can reference the shared
 * site and organization nodes by `@id` instead of repeating them.
 */
export function buildStructuredData(
  input: StructuredDataInput,
): Record<string, unknown> {
  const graph: Record<string, unknown>[] = [
    organization(),
    webSite(),
    webPage(input),
  ];
  if (input.breadcrumbs !== undefined && input.breadcrumbs.length > 0)
    graph.push(breadcrumbList(input.canonical, input.breadcrumbs));
  if (input.faqs !== undefined && input.faqs.length > 0)
    graph.push(faqPage(input.canonical, input.faqs));
  if (input.itemList !== undefined && input.itemList.length > 0)
    graph.push(itemList(input.canonical, input.itemList));
  if (input.article !== undefined)
    graph.push(techArticle(input, input.article));
  return { "@context": "https://schema.org", "@graph": graph };
}
