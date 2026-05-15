import crypto from "node:crypto";

export function cleanText(input: string | null | undefined): string {
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function slugFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const last = pathname.split("/").filter(Boolean).at(-1) || "unknown";
  return decodeURIComponent(last);
}

export function nameFromSlug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\(S\)/gi, "(S)")
    .trim();
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function markdownEscape(input: string): string {
  return input.replace(/\|/g, "\\|");
}

export function firstLines(input: string, maxChars: number): string {
  const cleaned = cleanText(input);
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars).trimEnd() + "\n...";
}
