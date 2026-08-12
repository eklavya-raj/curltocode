import "@testing-library/jest-dom/vitest";

if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = (): void => undefined;
}
