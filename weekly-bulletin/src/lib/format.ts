import { BulletinDocument, ImageAsset, NewsItem } from "./types";

export function normalizeImageKey(value: string): string {
  return value
    .trim()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr")
    .replace(/['’`"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function summaryTextToHtml(text: string): string {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return "<p></p>";

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function summaryHtmlToText(html: string): string {
  const element = document.createElement("div");
  element.innerHTML = html;
  return (element.textContent || "").replace(/\u00a0/g, " ").trim();
}

export function normalizeSummaryHtml(item: Partial<NewsItem>): string {
  if (item.summaryHtml?.trim()) {
    return item.summaryHtml;
  }

  const summary = String(item.summary ?? "").trim();
  return summary ? summaryTextToHtml(summary) : "";
}

export function touchDocument(document: BulletinDocument): BulletinDocument {
  return {
    ...document,
    updatedAt: new Date().toISOString(),
  };
}

export function updateNewsItem(
  document: BulletinDocument,
  itemId: string,
  updater: (item: NewsItem) => NewsItem
): BulletinDocument {
  return touchDocument({
    ...document,
    newsItems: document.newsItems.map((item) => (item.id === itemId ? updater(item) : item)),
  });
}

export function replaceUploadedImage(document: BulletinDocument, asset: ImageAsset): BulletinDocument {
  const nextImages = document.uploadedImages.filter((image) => image.name !== asset.name);
  nextImages.push(asset);

  return touchDocument({
    ...document,
    uploadedImages: nextImages.sort((left, right) => left.name.localeCompare(right.name, "tr")),
  });
}

export function removeUploadedImage(document: BulletinDocument, imageName: string): BulletinDocument {
  return touchDocument({
    ...document,
    uploadedImages: document.uploadedImages.filter((image) => image.name !== imageName),
    newsItems: document.newsItems.map((item) =>
      item.imageName === imageName ? { ...item, imageName: "" } : item
    ),
  });
}

export function resolveImage(document: BulletinDocument, imageName: string): ImageAsset | undefined {
  if (!imageName) return undefined;
  const normalizedTarget = normalizeImageKey(imageName);

  return document.uploadedImages.find((image) => {
    if (image.name === imageName) return true;
    return normalizeImageKey(image.name) === normalizedTarget;
  });
}

export function buildMetaLine(item: NewsItem): string {
  return [item.source, item.author].filter(Boolean).join(" | ");
}

export function sanitizeLink(link: string): string {
  const trimmed = link.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function reorderNewsItems(
  document: BulletinDocument,
  sourceId: string,
  targetId: string,
  position: "before" | "after" = "before"
): BulletinDocument {
  const items = [...document.newsItems];
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return document;
  }

  const [moved] = items.splice(sourceIndex, 1);
  const normalizedTargetIndex = items.findIndex((item) => item.id === targetId);

  if (normalizedTargetIndex < 0) {
    return document;
  }

  const insertIndex = position === "after" ? normalizedTargetIndex + 1 : normalizedTargetIndex;
  items.splice(insertIndex, 0, moved);

  return touchDocument({
    ...document,
    newsItems: items,
  });
}
