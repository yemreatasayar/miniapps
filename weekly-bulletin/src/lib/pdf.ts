import fontkit from "@pdf-lib/fontkit";
import {
  PDFArray,
  PDFDocument,
  PDFFont,
  PDFName,
  PDFNumber,
  PDFString,
  rgb,
} from "pdf-lib";
import { buildBulletinLayout, createCanvasTextMeasurer } from "./layout";
import { dataUrlToUint8Array } from "./images";
import { resolveImage } from "./format";
import { BulletinDocument, BulletinLayout, LayoutRect, LayoutTextBlock, LayoutTextStyle } from "./types";

const PX_TO_PT = 0.75;
const PDF_BACKGROUND_COLOR = "#0000ee";
const LOGO_SCALE = 4;
const IMAGE_SCALE = 1.15;
const IMAGE_QUALITY = 0.76;

// Montserrat ağırlık -> gömülecek TTF. (Italic TTF yok; içe aktarılan özetlerde
// italik olmaz, yalnızca manuel formatlamada nadiren çıkar ve düz çizilir.)
const FONT_FILES: Record<number, string> = {
  500: "/fonts/Montserrat-Medium.ttf",
  600: "/fonts/Montserrat-SemiBold.ttf",
  800: "/fonts/Montserrat-ExtraBold.ttf",
};

type FontEntry = { font: PDFFont; ascentRatio: number };
type FontRegistry = Map<number, FontEntry>;

function px(value: number): number {
  return value * PX_TO_PT;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const size = normalized.length === 3 ? 1 : 2;
  const values = normalized
    .match(new RegExp(`.{1,${size}}`, "g"))
    ?.map((part) => (size === 1 ? part + part : part))
    .map((part) => Number.parseInt(part, 16) / 255);

  if (!values || values.length < 3) {
    return [0, 0, 0];
  }

  return [values[0], values[1], values[2]];
}

function colorOf(hex?: string) {
  return rgb(...hexToRgb(hex ?? "#111111"));
}

function drawVerticalBackground(page: any, layout: BulletinLayout): void {
  // Acrobat uzun tek sayfalarda gradient/shading'i bazen geç rasterize ediyor.
  // Tek RGB dolgu en stabil render yolu; preview ile export aynı renkte kalır.
  page.drawRectangle({
    x: 0,
    y: 0,
    width: px(layout.width),
    height: px(layout.height),
    color: colorOf(PDF_BACKGROUND_COLOR),
  });
}

function addLinkAnnotation(page: any, layout: BulletinLayout, x: number, y: number, width: number, height: number, url: string): void {
  const context = page.doc.context;
  const annotation = context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [
      PDFNumber.of(px(x)),
      PDFNumber.of(px(layout.height - y - height)),
      PDFNumber.of(px(x + width)),
      PDFNumber.of(px(layout.height - y)),
    ],
    Border: [0, 0, 0],
    A: {
      Type: "Action",
      S: "URI",
      URI: PDFString.of(url),
    },
  });
  const annotationRef = context.register(annotation);
  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray) ?? context.obj([]);
  annots.push(annotationRef);
  page.node.set(PDFName.of("Annots"), annots);
}

// --- Font yükleme ---------------------------------------------------------

async function loadFonts(pdfDoc: PDFDocument): Promise<FontRegistry> {
  const registry: FontRegistry = new Map();

  await Promise.all(
    Object.entries(FONT_FILES).map(async ([weight, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Font yüklenemedi: ${url}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      // subset:false (tam gömme) — Montserrat ~200KB/ağırlık; eski tam-sayfa
      // PNG'ye kıyasla yine çok küçük ve subset hatası riski olmadan kurşun
      // geçirmez. Türkçe glifler garanti.
      const font = await pdfDoc.embedFont(bytes, { subset: false });
      const metrics = fontkit.create(bytes) as { ascent: number; unitsPerEm: number };
      const ascentRatio = metrics.unitsPerEm > 0 ? metrics.ascent / metrics.unitsPerEm : 0.96;
      registry.set(Number(weight), { font, ascentRatio });
    })
  );

  return registry;
}

function pickWeight(weight: number): number {
  if (weight >= 700) return 800;
  if (weight >= 600) return 600;
  return 500;
}

function fontFor(fonts: FontRegistry, weight: number): FontEntry {
  return fonts.get(pickWeight(weight)) ?? fonts.get(500)!;
}

// --- Vektör çizim yardımcıları (canvas yerine pdf-lib) --------------------

// Yuvarlak köşeli dikdörtgen; köşeler cubic-bezier (arc-sweep belirsizliğinden
// kaçınmak için). Koordinatlar nokta (pt) ve y-aşağı; drawSvgPath translate+
// scale(1,-1) uyguladığı için anchor = dikdörtgenin PDF üst kenarıdır.
function roundedRectPath(w: number, h: number, r: number): string {
  if (r <= 0) {
    return `M 0 0 H ${w} V ${h} H 0 Z`;
  }
  const c = r * 0.5523; // çeyrek daire bezier kontrol mesafesi
  return [
    `M ${r} 0`,
    `H ${w - r}`,
    `C ${w - r + c} 0 ${w} ${r - c} ${w} ${r}`,
    `V ${h - r}`,
    `C ${w} ${h - r + c} ${w - r + c} ${h} ${w - r} ${h}`,
    `H ${r}`,
    `C ${r - c} ${h} 0 ${h - r + c} 0 ${h - r}`,
    `V ${r}`,
    `C 0 ${r - c} ${r - c} 0 ${r} 0`,
    `Z`,
  ].join(" ");
}

function drawRect(page: any, layout: BulletinLayout, rect: LayoutRect): void {
  const wPt = px(rect.width);
  const hPt = px(rect.height);
  const rPt = Math.max(0, Math.min(px(rect.radius ?? 0), wPt / 2, hPt / 2));
  const path = roundedRectPath(wPt, hPt, rPt);

  const options: Record<string, unknown> = {
    x: px(rect.x),
    y: px(layout.height - rect.y),
    scale: 1,
  };
  if (rect.fill && rect.fill !== "transparent") {
    options.color = colorOf(rect.fill);
  }
  if (rect.stroke && rect.strokeWidth) {
    options.borderColor = colorOf(rect.stroke);
    options.borderWidth = px(rect.strokeWidth);
  }

  page.drawSvgPath(path, options);
}

function drawDivider(page: any, layout: BulletinLayout, rect: LayoutRect): void {
  page.drawRectangle({
    x: px(rect.x),
    y: px(layout.height - rect.y - rect.height),
    width: px(rect.width),
    height: Math.max(px(rect.height), 0.75),
    color: colorOf(rect.fill),
  });
}

function alignedX(blockXPt: number, blockWidthPt: number, lineWidthPt: number, align?: string): number {
  if (align === "center") return blockXPt + (blockWidthPt - lineWidthPt) / 2;
  if (align === "right") return blockXPt + blockWidthPt - lineWidthPt;
  return blockXPt;
}

function drawTextBlock(page: any, fonts: FontRegistry, layout: BulletinLayout, block: LayoutTextBlock): void {
  const style = block.style;
  const entry = fontFor(fonts, style.fontWeight);
  const size = px(style.fontSize);
  const color = colorOf(style.color);
  const ascentPx = style.fontSize * entry.ascentRatio;
  const blockXPt = px(block.x);
  const blockWidthPt = px(block.width);

  block.wrapped.lines.forEach((line, index) => {
    if (!line) return;
    const topPx = block.y + index * style.lineHeight;
    const lineWidthPt = entry.font.widthOfTextAtSize(line, size);
    const xPt = alignedX(blockXPt, blockWidthPt, lineWidthPt, style.textAlign);
    const baselinePx = topPx + ascentPx;
    page.drawText(line, {
      x: xPt,
      y: px(layout.height - baselinePx),
      size,
      font: entry.font,
      color,
    });
  });
}

function drawCenteredSingleLineText(
  page: any,
  fonts: FontRegistry,
  layout: BulletinLayout,
  block: LayoutTextBlock,
  rect: LayoutRect
): void {
  const style = block.style;
  const entry = fontFor(fonts, style.fontWeight);
  const size = px(style.fontSize);
  const text = block.wrapped.lines[0] || block.text;
  if (!text) return;

  const lineWidthPt = entry.font.widthOfTextAtSize(text, size);
  const xPt = alignedX(px(block.x), px(block.width), lineWidthPt, style.textAlign);
  const baselinePx = rect.y + (rect.height - style.lineHeight) / 2 + style.fontSize * entry.ascentRatio;

  page.drawText(text, {
    x: xPt,
    y: px(layout.height - baselinePx),
    size,
    font: entry.font,
    color: colorOf(style.color),
  });
}

type InlineRun = { text: string; bold: boolean; italic: boolean; fontSize: number };
type ParsedParagraph = { runs: InlineRun[]; align: "left" | "center" | "right" };

function parseHtmlParagraphs(html: string, baseFontSize: number): ParsedParagraph[] {
  const div = globalThis.document.createElement("div");
  div.innerHTML = html;
  const paragraphs: ParsedParagraph[] = [];

  function extractRuns(node: Node, ctx: { bold: boolean; italic: boolean; fontSize: number }): InlineRun[] {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/ /g, " ");
      return text ? [{ ...ctx, text }] : [];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const next = { ...ctx };
    if (tag === "strong" || tag === "b") next.bold = true;
    if (tag === "em" || tag === "i") next.italic = true;
    if (tag === "span") {
      if (el.style.fontWeight === "bold" || Number(el.style.fontWeight) >= 700) next.bold = true;
      if (el.style.fontStyle === "italic") next.italic = true;
      const fs = Number.parseInt(el.style.fontSize);
      if (!Number.isNaN(fs) && fs > 0) next.fontSize = fs;
    }
    if (tag === "br") return [{ text: "\n", bold: ctx.bold, italic: ctx.italic, fontSize: ctx.fontSize }];
    const runs: InlineRun[] = [];
    for (const child of Array.from(el.childNodes)) runs.push(...extractRuns(child, next));
    return runs;
  }

  function processBlock(el: Element): void {
    const htmlEl = el as HTMLElement;
    const align =
      htmlEl.style.textAlign === "center" ? "center" :
      htmlEl.style.textAlign === "right" ? "right" : "left";
    paragraphs.push({ runs: extractRuns(el, { bold: false, italic: false, fontSize: baseFontSize }), align });
  }

  let hasBlock = false;
  for (const child of Array.from(div.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === "p" || tag === "div") { processBlock(el); hasBlock = true; }
      else if (tag === "br") { paragraphs.push({ runs: [], align: "left" }); hasBlock = true; }
      else {
        const runs = extractRuns(el, { bold: false, italic: false, fontSize: baseFontSize });
        if (runs.length) { paragraphs.push({ runs, align: "left" }); hasBlock = true; }
      }
    } else if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? "").replace(/ /g, " ").trim();
      if (text) { paragraphs.push({ runs: [{ text, bold: false, italic: false, fontSize: baseFontSize }], align: "left" }); hasBlock = true; }
    }
  }

  if (!hasBlock) {
    const text = (div.textContent ?? "").replace(/ /g, " ").trim();
    if (text) paragraphs.push({ runs: [{ text, bold: false, italic: false, fontSize: baseFontSize }], align: "left" });
  }

  return paragraphs;
}

// Zengin metin (özet) — paragraf bazında tek stil (canvas davranışıyla birebir):
// paragrafta herhangi bir run bold ise tüm paragraf bold çizilir.
function drawRichTextBlock(page: any, fonts: FontRegistry, layout: BulletinLayout, block: LayoutTextBlock): void {
  if (!block.html) {
    drawTextBlock(page, fonts, layout, block);
    return;
  }

  const paragraphs = parseHtmlParagraphs(block.html, block.style.fontSize);
  const baseSize = block.style.fontSize;
  const baseLineHeight = block.style.lineHeight;
  const color = colorOf(block.style.color);
  const blockXPt = px(block.x);
  const maxWidthPt = px(block.width);
  const paraGap = Math.round(baseLineHeight * 0.95);

  let yTop = block.y;

  for (let pi = 0; pi < paragraphs.length; pi += 1) {
    const para = paragraphs[pi];
    const isLast = pi === paragraphs.length - 1;

    if (!para.runs.length) { yTop += paraGap; continue; }

    const fullText = para.runs.map((run) => run.text).join("");
    const lineSegments = fullText.split("\n");
    const hasBold = para.runs.some((run) => run.bold);
    const maxFontSize = Math.max(...para.runs.map((run) => run.fontSize));
    const entry = fontFor(fonts, hasBold ? 800 : block.style.fontWeight);
    const size = px(maxFontSize);
    const ascentPx = maxFontSize * entry.ascentRatio;
    const lineH = Math.round((baseLineHeight * maxFontSize) / baseSize);

    for (const segment of lineSegments) {
      const words = segment.split(/\s+/).filter(Boolean);
      if (!words.length) { yTop += lineH; continue; }

      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (entry.font.widthOfTextAtSize(candidate, size) <= maxWidthPt) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);

      for (const line of lines) {
        const lineWidthPt = entry.font.widthOfTextAtSize(line, size);
        const xPt = alignedX(blockXPt, maxWidthPt, lineWidthPt, para.align);
        page.drawText(line, {
          x: xPt,
          y: px(layout.height - (yTop + ascentPx)),
          size,
          font: entry.font,
          color,
        });
        yTop += lineH;
      }
    }

    if (!isLast) yTop += paraGap;
  }
}

function drawPlaceholderImage(page: any, fonts: FontRegistry, layout: BulletinLayout, rect: LayoutRect): void {
  drawRect(page, layout, rect);
  const entry = fontFor(fonts, 600);
  const size = px(22);
  // canvas'taki textBaseline:"middle" karşılığı (yaklaşık).
  const baselinePx = rect.y + rect.height / 2 + 22 * 0.34;
  page.drawText("Görsel yok", {
    x: px(rect.x + 28),
    y: px(layout.height - baselinePx),
    size,
    font: entry.font,
    color: colorOf("#5c6376"),
  });
}

// --- Raster yardımcıları (yalnızca fotoğraflar ve logo için) --------------

function createCanvas(width: number, height: number, scale: number): CanvasRenderingContext2D {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas bağlamı oluşturulamadı.");
  }

  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

function canvasToDataUrl(ctx: CanvasRenderingContext2D, mimeType: string, quality?: number): string {
  const canvas = ctx.canvas as HTMLCanvasElement;
  return canvas.toDataURL(mimeType, quality);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Görsel yüklenemedi."));
    image.src = src;
  });
}

async function createHighResLogoDataUrl(assetUrl: string, width: number, height: number): Promise<string> {
  const image = await loadImage(assetUrl);
  const ctx = createCanvas(width, height, LOGO_SCALE);
  ctx.drawImage(image, 0, 0, width, height);
  return canvasToDataUrl(ctx, "image/png");
}

async function createCroppedImageDataUrl(assetDataUrl: string, targetWidth: number, targetHeight: number): Promise<string> {
  const image = await loadImage(assetDataUrl);
  const ctx = createCanvas(targetWidth, targetHeight, IMAGE_SCALE);
  const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = (targetWidth - drawWidth) / 2;
  const drawY = (targetHeight - drawHeight) / 2;

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  // Acrobat tek-uzun sayfada büyük PNG/JPEG resimleri hareket sırasında
  // düşük çözünürlüklü cache'den gösterebiliyor. Orta ölçekli baseline JPEG,
  // hem dosyayı küçültür hem de ilk render yükünü azaltır.
  return canvasToDataUrl(ctx, "image/jpeg", IMAGE_QUALITY);
}

async function embedImage(pdfDoc: PDFDocument, dataUrl: string) {
  const bytes = dataUrlToUint8Array(dataUrl);
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
    return pdfDoc.embedJpg(bytes);
  }
  return pdfDoc.embedPng(bytes);
}

// --- Dışa aktarım ---------------------------------------------------------

export async function exportDocumentPdf(bulletin: BulletinDocument): Promise<Blob> {
  // Ölçüm fontları YÜKLENDİKTEN sonra yapılmalı; yoksa layout fallback font
  // metrikleriyle kurulur ve metin/link kutuları kayar (deterministik olmayan
  // "bazen kırık link / tekrar render düzeltiyor" sorunu).
  if ("fonts" in globalThis.document) {
    await globalThis.document.fonts.ready;
  }

  const measure = createCanvasTextMeasurer();
  const layout = buildBulletinLayout(bulletin, measure);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fonts = await loadFonts(pdfDoc);

  const page = pdfDoc.addPage([px(layout.width), px(layout.height)]);

  // Arka plan (vektör gradyan) + beyaz panel + başlık rozeti (hepsi vektör).
  drawVerticalBackground(page, layout);
  drawRect(page, layout, layout.whitePanel);
  drawRect(page, layout, layout.headerBadge);
  drawTextBlock(page, fonts, layout, layout.intro);

  // Başlık logosu (yüksek çözünürlüklü raster).
  const headerLogoDataUrl = await createHighResLogoDataUrl(
    "/assets/header-logo.svg",
    layout.headerLogo.width,
    layout.headerLogo.height
  );
  const headerLogoImage = await embedImage(pdfDoc, headerLogoDataUrl);
  page.drawImage(headerLogoImage, {
    x: px(layout.headerLogo.x),
    y: px(layout.height - layout.headerLogo.y - layout.headerLogo.height),
    width: px(layout.headerLogo.width),
    height: px(layout.headerLogo.height),
  });

  // Haber blokları — metinler vektör, fotoğraflar raster.
  for (const itemLayout of layout.newsLayouts) {
    drawTextBlock(page, fonts, layout, itemLayout.title);

    const asset = resolveImage(bulletin, itemLayout.imageName);
    if (asset) {
      const croppedImageDataUrl = await createCroppedImageDataUrl(
        asset.dataUrl,
        itemLayout.imageRect.width,
        itemLayout.imageRect.height
      );
      const croppedImage = await embedImage(pdfDoc, croppedImageDataUrl);
      page.drawImage(croppedImage, {
        x: px(itemLayout.imageRect.x),
        y: px(layout.height - itemLayout.imageRect.y - itemLayout.imageRect.height),
        width: px(itemLayout.imageRect.width),
        height: px(itemLayout.imageRect.height),
      });
    } else {
      drawPlaceholderImage(page, fonts, layout, itemLayout.imageRect);
    }

    drawTextBlock(page, fonts, layout, itemLayout.meta);
    drawTextBlock(page, fonts, layout, itemLayout.date);
    drawDivider(page, layout, itemLayout.divider);
    drawRichTextBlock(page, fonts, layout, itemLayout.summary);
    drawRect(page, layout, itemLayout.linkRect);
    drawCenteredSingleLineText(page, fonts, layout, itemLayout.linkText, itemLayout.linkRect);
  }

  // Tıklanabilir link annotation'ları.
  for (const itemLayout of layout.newsLayouts) {
    if (itemLayout.link) {
      addLinkAnnotation(
        page,
        layout,
        itemLayout.linkRect.x,
        itemLayout.linkRect.y,
        itemLayout.linkRect.width,
        itemLayout.linkRect.height,
        itemLayout.link
      );
    }
  }

  const bytes = await pdfDoc.save();
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "application/pdf" });
}
