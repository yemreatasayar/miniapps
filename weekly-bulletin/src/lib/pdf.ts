import fontkit from "@pdf-lib/fontkit";
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFString, rgb } from "pdf-lib";
import { buildBulletinLayout, createCanvasTextMeasurer } from "./layout";
import { dataUrlToUint8Array } from "./images";
import { resolveImage } from "./format";
import { BulletinDocument, BulletinLayout, LayoutRect, LayoutTextBlock, LayoutTextStyle } from "./types";

const PX_TO_PT = 0.75;
const OVERLAY_SCALE = 2;
const LOGO_SCALE = 4;
const IMAGE_SCALE = 1.4;
const IMAGE_QUALITY = 0.8;

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

function interpolateColor(start: [number, number, number], end: [number, number, number], progress: number): [number, number, number] {
  return [
    start[0] + (end[0] - start[0]) * progress,
    start[1] + (end[1] - start[1]) * progress,
    start[2] + (end[2] - start[2]) * progress,
  ];
}

function drawVerticalBackground(page: any, layout: BulletinLayout): void {
  const topColor = hexToRgb("#0000ee");
  const bottomColor = hexToRgb("#230bad");
  const solidHeight = layout.height * 0.62;
  const gradientHeight = Math.max(1, layout.height - solidHeight);
  const steps = 420;

  page.drawRectangle({
    x: 0,
    y: px(layout.height - solidHeight),
    width: px(layout.width),
    height: px(solidHeight),
    color: rgb(...topColor),
  });

  for (let index = 0; index < steps; index += 1) {
    const startY = solidHeight + (gradientHeight * index) / steps;
    const segmentHeight = gradientHeight / steps;
    const color = interpolateColor(topColor, bottomColor, index / Math.max(1, steps - 1));

    page.drawRectangle({
      x: 0,
      y: px(layout.height - startY - segmentHeight),
      width: px(layout.width),
      height: Math.max(px(segmentHeight), 0.75),
      color: rgb(...color),
    });
  }
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

function buildCanvasFont(style: LayoutTextStyle): string {
  return `${style.fontStyle ?? "normal"} ${style.fontWeight} ${style.fontSize}px "${style.fontFamily}", sans-serif`;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, rect: LayoutRect): void {
  const radius = Math.max(0, Math.min(rect.radius ?? 0, rect.width / 2, rect.height / 2));

  ctx.beginPath();
  if (radius === 0) {
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
  } else {
    ctx.moveTo(rect.x + radius, rect.y);
    ctx.lineTo(rect.x + rect.width - radius, rect.y);
    ctx.arcTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + radius, radius);
    ctx.lineTo(rect.x + rect.width, rect.y + rect.height - radius);
    ctx.arcTo(rect.x + rect.width, rect.y + rect.height, rect.x + rect.width - radius, rect.y + rect.height, radius);
    ctx.lineTo(rect.x + radius, rect.y + rect.height);
    ctx.arcTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - radius, radius);
    ctx.lineTo(rect.x, rect.y + radius);
    ctx.arcTo(rect.x, rect.y, rect.x + radius, rect.y, radius);
  }
  ctx.closePath();

  if (rect.fill !== "transparent") {
    ctx.fillStyle = rect.fill;
    ctx.fill();
  }

  if (rect.stroke && rect.strokeWidth) {
    ctx.strokeStyle = rect.stroke;
    ctx.lineWidth = rect.strokeWidth;
    ctx.stroke();
  }
}

function drawTextBlock(ctx: CanvasRenderingContext2D, block: LayoutTextBlock): void {
  ctx.save();
  ctx.font = buildCanvasFont(block.style);
  ctx.fillStyle = block.style.color ?? "#111111";
  ctx.textBaseline = "top";
  ctx.textAlign = block.style.textAlign ?? "left";

  const anchorX =
    block.style.textAlign === "center"
      ? block.x + block.width / 2
      : block.style.textAlign === "right"
        ? block.x + block.width
        : block.x;

  block.wrapped.lines.forEach((line, index) => {
    ctx.fillText(line, anchorX, block.y + index * block.style.lineHeight);
  });
  ctx.restore();
}

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

type InlineRun = { text: string; bold: boolean; italic: boolean; fontSize: number };
type ParsedParagraph = { runs: InlineRun[]; align: "left" | "center" | "right" };

function parseHtmlParagraphs(html: string, baseFontSize: number): ParsedParagraph[] {
  const div = globalThis.document.createElement("div");
  div.innerHTML = html;
  const paragraphs: ParsedParagraph[] = [];

  function extractRuns(node: Node, ctx: { bold: boolean; italic: boolean; fontSize: number }): InlineRun[] {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\u00a0/g, " ");
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
      const text = (child.textContent ?? "").replace(/\u00a0/g, " ").trim();
      if (text) { paragraphs.push({ runs: [{ text, bold: false, italic: false, fontSize: baseFontSize }], align: "left" }); hasBlock = true; }
    }
  }

  if (!hasBlock) {
    const text = (div.textContent ?? "").replace(/\u00a0/g, " ").trim();
    if (text) paragraphs.push({ runs: [{ text, bold: false, italic: false, fontSize: baseFontSize }], align: "left" });
  }

  return paragraphs;
}

function drawHtmlTextOnCanvas(ctx: CanvasRenderingContext2D, block: LayoutTextBlock): void {
  if (!block.html) { drawTextBlock(ctx, block); return; }

  const paragraphs = parseHtmlParagraphs(block.html, block.style.fontSize);
  const { fontFamily, lineHeight: baseLineHeight, color, fontWeight: baseWeight } = block.style;
  const maxWidth = block.width;
  let y = block.y;
  const paraGap = Math.round(baseLineHeight * 0.95);

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi];
    const isLast = pi === paragraphs.length - 1;

    if (!para.runs.length) { y += paraGap; continue; }

    const fullText = para.runs.map((r) => r.text).join("");
    const lineSegments = fullText.split("\n");
    const hasBold = para.runs.some((r) => r.bold);
    const hasItalic = para.runs.some((r) => r.italic);
    const maxFontSize = Math.max(...para.runs.map((r) => r.fontSize));
    const fontStyle = hasItalic ? "italic" : "normal";
    const fontWeight = hasBold ? 800 : baseWeight;
    const lineH = Math.round((baseLineHeight * maxFontSize) / block.style.fontSize);

    ctx.save();
    ctx.font = `${fontStyle} ${fontWeight} ${maxFontSize}px "${fontFamily}", sans-serif`;
    ctx.fillStyle = color ?? "#111111";
    ctx.textBaseline = "top";
    ctx.textAlign = para.align;
    const anchorX =
      para.align === "center" ? block.x + maxWidth / 2 :
      para.align === "right" ? block.x + maxWidth : block.x;

    for (const segment of lineSegments) {
      const words = segment.split(/\s+/).filter(Boolean);
      if (!words.length) { y += lineH; continue; }
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) { current = candidate; }
        else { if (current) lines.push(current); current = word; }
      }
      if (current) lines.push(current);
      for (const line of lines) { ctx.fillText(line, anchorX, y); y += lineH; }
    }
    ctx.restore();
    if (!isLast) y += paraGap;
  }
}

async function createOverlayLayerDataUrl(bulletin: BulletinDocument, layout: BulletinLayout): Promise<string> {
  const ctx = createCanvas(layout.width, layout.height, OVERLAY_SCALE);

  if ("fonts" in globalThis.document) {
    await globalThis.document.fonts.ready;
  }

  drawRoundedRect(ctx, layout.whitePanel);
  drawRoundedRect(ctx, layout.headerBadge);
  drawTextBlock(ctx, layout.intro);

  for (const itemLayout of layout.newsLayouts) {
    drawTextBlock(ctx, itemLayout.title);
    drawTextBlock(ctx, itemLayout.meta);
    drawTextBlock(ctx, itemLayout.date);

    ctx.save();
    ctx.fillStyle = itemLayout.divider.fill;
    ctx.fillRect(itemLayout.divider.x, itemLayout.divider.y, itemLayout.divider.width, itemLayout.divider.height);
    ctx.restore();

    drawHtmlTextOnCanvas(ctx, itemLayout.summary);
    drawRoundedRect(ctx, itemLayout.linkRect);
    drawTextBlock(ctx, itemLayout.linkText);

    if (!resolveImage(bulletin, itemLayout.imageName)) {
      drawRoundedRect(ctx, itemLayout.imageRect);
      ctx.save();
      ctx.font = '600 22px "Montserrat", sans-serif';
      ctx.fillStyle = "#5c6376";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(
        "Görsel yok",
        itemLayout.imageRect.x + 28,
        itemLayout.imageRect.y + itemLayout.imageRect.height / 2
      );
      ctx.restore();
    }
  }

  return canvasToDataUrl(ctx, "image/png");
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
  return canvasToDataUrl(ctx, "image/jpeg", IMAGE_QUALITY);
}

async function embedImage(pdfDoc: PDFDocument, dataUrl: string) {
  const bytes = dataUrlToUint8Array(dataUrl);
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
    return pdfDoc.embedJpg(bytes);
  }
  return pdfDoc.embedPng(bytes);
}

export async function exportDocumentPdf(bulletin: BulletinDocument): Promise<Blob> {
  const measure = createCanvasTextMeasurer();
  const layout = buildBulletinLayout(bulletin, measure);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const page = pdfDoc.addPage([px(layout.width), px(layout.height)]);
  drawVerticalBackground(page, layout);

  const overlayLayerDataUrl = await createOverlayLayerDataUrl(bulletin, layout);
  const overlayLayerImage = await embedImage(pdfDoc, overlayLayerDataUrl);
  page.drawImage(overlayLayerImage, {
    x: 0,
    y: 0,
    width: px(layout.width),
    height: px(layout.height),
  });

  for (const itemLayout of layout.newsLayouts) {
    const asset = resolveImage(bulletin, itemLayout.imageName);
    if (!asset) continue;

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
  }

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
