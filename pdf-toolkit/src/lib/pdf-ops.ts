import { zipSync } from "fflate";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import * as XLSX from "xlsx";
import type {
  ExtractedTextBlock,
  ExtractedTextBlockKind,
  ExtractedTableDocument,
  ExtractedTablePage,
  ExtractedTextDocument,
  ImageExportFormat,
  LoadedPdf,
  PdfPage,
  WatermarkSettings,
} from "./types";
import { getPdfLocale, pdfCopy } from "./i18n";

import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const THUMBNAIL_WIDTH = 160;
const EXPORT_MAX_DIMENSION = 2200;
const OCR_MAX_DIMENSION = 2600;
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const OCR_LANGUAGES = "tur+eng";

function runtimeErrors() {
  return pdfCopy[getPdfLocale()].runtimeErrors;
}

type OcrProgressCopy = {
  preparing: string;
  page: (current: number, total: number) => string;
  done: string;
};

type TableProgressCopy = {
  page: (current: number, total: number) => string;
  done: string;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

async function openPdfForPreview(fileBytes: Uint8Array) {
  return pdfjsLib.getDocument({ data: fileBytes.slice(0) }).promise;
}

async function renderPageThumbnail(
  doc: pdfjsLib.PDFDocumentProxy,
  pageIndex: number,
  rotation: number
): Promise<string> {
  const page = await doc.getPage(pageIndex + 1);
  const baseViewport = page.getViewport({ scale: 1, rotation });
  const scale = THUMBNAIL_WIDTH / Math.max(baseViewport.width, 1);
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error(runtimeErrors().canvasContext);
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/png");
}

async function renderPageToBlob(
  page: pdfjsLib.PDFPageProxy,
  rotation: number,
  format: ImageExportFormat,
  maxDimension: number
): Promise<Blob> {
  const baseViewport = page.getViewport({ scale: 1, rotation });
  const scale = maxDimension / Math.max(baseViewport.width, baseViewport.height, 1);
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error(runtimeErrors().canvasContext);
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  if (format === "jpg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  await page.render({ canvasContext: context, viewport }).promise;

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(runtimeErrors().imageBlob));
          return;
        }

        resolve(blob);
      },
      format === "png" ? "image/png" : "image/jpeg",
      format === "png" ? undefined : 0.92
    );
  });
}

export async function renderThumbnail(
  fileBytes: Uint8Array,
  pageIndex: number,
  rotation: number
): Promise<string> {
  const doc = await openPdfForPreview(fileBytes);
  try {
    return await renderPageThumbnail(doc, pageIndex, rotation);
  } finally {
    await doc.destroy();
  }
}

export async function renderPageImageBlob(
  fileBytes: Uint8Array,
  pageIndex: number,
  rotation: number,
  format: ImageExportFormat
): Promise<Blob> {
  const doc = await openPdfForPreview(fileBytes);

  try {
    const page = await doc.getPage(pageIndex + 1);
    return await renderPageToBlob(page, rotation, format, EXPORT_MAX_DIMENSION);
  } finally {
    await doc.destroy();
  }
}

export async function loadPdfFromBytes(fileName: string, fileBytes: Uint8Array): Promise<LoadedPdf> {
  const doc = await openPdfForPreview(fileBytes);

  try {
    const pages: PdfPage[] = [];

    for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex += 1) {
      const thumbnail = await renderPageThumbnail(doc, pageIndex, 0);
      pages.push({ pageIndex, rotation: 0, thumbnail });
    }

    return { fileName, fileBytes, pages };
  } finally {
    await doc.destroy();
  }
}

export async function loadPdf(file: File): Promise<LoadedPdf> {
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  return loadPdfFromBytes(file.name, fileBytes);
}

export async function splitPdf(
  fileBytes: Uint8Array,
  ranges: Array<{ from: number; to: number }>
): Promise<Uint8Array[]> {
  const source = await PDFDocument.load(fileBytes, { throwOnInvalidObject: false, ignoreEncryption: true });
  const outputs: Uint8Array[] = [];

  for (const range of ranges) {
    const next = await PDFDocument.create();
    const indices = Array.from({ length: range.to - range.from + 1 }, (_, index) => range.from + index);
    const copied = await next.copyPages(source, indices);
    copied.forEach((page) => next.addPage(page));
    outputs.push(await next.save({ useObjectStreams: false }));
  }

  return outputs;
}

export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  for (const fileBytes of files) {
    const source = await PDFDocument.load(fileBytes, { throwOnInvalidObject: false, ignoreEncryption: true });
    const copied = await merged.copyPages(
      source,
      source.getPages().map((_, index) => index)
    );
    copied.forEach((page) => merged.addPage(page));
  }

  return merged.save({ useObjectStreams: false });
}

export async function extractPages(fileBytes: Uint8Array, pageIndices: number[]): Promise<Uint8Array> {
  const source = await PDFDocument.load(fileBytes, { throwOnInvalidObject: false, ignoreEncryption: true });
  const next = await PDFDocument.create();
  const copied = await next.copyPages(source, pageIndices);
  copied.forEach((page) => next.addPage(page));
  return next.save({ useObjectStreams: false });
}

export async function reorderPages(fileBytes: Uint8Array, newOrder: number[]): Promise<Uint8Array> {
  const source = await PDFDocument.load(fileBytes, { throwOnInvalidObject: false, ignoreEncryption: true });
  const next = await PDFDocument.create();
  const copied = await next.copyPages(source, newOrder);
  copied.forEach((page) => next.addPage(page));
  return next.save({ useObjectStreams: false });
}

export async function rotatePages(
  fileBytes: Uint8Array,
  rotations: Record<number, number>
): Promise<Uint8Array> {
  const source = await PDFDocument.load(fileBytes, { throwOnInvalidObject: false, ignoreEncryption: true });
  source.getPages().forEach((page, index) => {
    const rotation = rotations[index];
    if (rotation !== undefined) {
      page.setRotation(degrees(rotation));
    }
  });
  return source.save({ useObjectStreams: false });
}

const WATERMARK_COLORS = {
  white: rgb(1, 1, 1),
  black: rgb(0, 0, 0),
  gray: rgb(0.55, 0.55, 0.55),
};

const SQRT2_2 = Math.SQRT2 / 2; // cos(45°) = sin(45°)

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getDataUrlMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;,]+)[;,]/);
  return match?.[1] ?? "image/png";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function median(values: number[]): number {
  if (values.length === 0) return 12;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function classifyTextBlock(text: string, fontSize: number, baseFontSize: number): ExtractedTextBlockKind {
  const words = text.split(/\s+/).filter(Boolean);
  const isShort = words.length <= 8;
  const endsLikeSentence = /[.!?:;]$/.test(text);

  if (fontSize >= baseFontSize * 1.55 || (fontSize >= baseFontSize * 1.35 && isShort)) {
    return "heading";
  }

  if (
    fontSize >= baseFontSize * 1.18 ||
    (fontSize >= baseFontSize * 1.05 && words.length <= 12 && !endsLikeSentence)
  ) {
    return "subheading";
  }

  return "body";
}

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

type PdfTextLine = {
  text: string;
  fontSize: number;
};

type PositionedTextItem = {
  text: string;
  x: number;
  y: number;
  right: number;
  fontSize: number;
};

function isPdfTextItem(value: unknown): value is PdfTextItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "str" in value &&
    typeof (value as { str: unknown }).str === "string" &&
    "transform" in value &&
    Array.isArray((value as { transform: unknown }).transform)
  );
}

function buildDocxParagraph(text: string, style: "Heading1" | "Heading2" | "BodyText"): string {
  return [
    "<w:p>",
    "  <w:pPr>",
    `    <w:pStyle w:val="${style}"/>`,
    "  </w:pPr>",
    "  <w:r>",
    `    <w:t xml:space="preserve">${escapeXml(text)}</w:t>`,
    "  </w:r>",
    "</w:p>",
  ].join("");
}

function buildDocxXml(extracted: ExtractedTextDocument): Uint8Array {
  const bodyParts: string[] = [];

  extracted.pages.forEach((page, pageIndex) => {
    page.blocks.forEach((block) => {
      const style =
        block.kind === "heading" ? "Heading1" : block.kind === "subheading" ? "Heading2" : "BodyText";
      bodyParts.push(buildDocxParagraph(block.text, style));
    });

    if (pageIndex < extracted.pages.length - 1) {
      bodyParts.push("<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>");
    }
  });

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": new TextEncoder().encode(
      [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">",
        "  <Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>",
        "  <Default Extension=\"xml\" ContentType=\"application/xml\"/>",
        "  <Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>",
        "  <Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>",
        "  <Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>",
        "  <Override PartName=\"/docProps/app.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.extended-properties+xml\"/>",
        "</Types>",
      ].join("")
    ),
    "_rels/.rels": new TextEncoder().encode(
      [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">",
        "  <Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>",
        "  <Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/>",
        "  <Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties\" Target=\"docProps/app.xml\"/>",
        "</Relationships>",
      ].join("")
    ),
    "docProps/core.xml": new TextEncoder().encode(
      [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" xmlns:dcmitype=\"http://purl.org/dc/dcmitype/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">",
        "  <dc:title>PDF Text Extract</dc:title>",
        "  <dc:creator>miniapps PDF Toolkit</dc:creator>",
        "  <cp:lastModifiedBy>miniapps PDF Toolkit</cp:lastModifiedBy>",
        `  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>`,
        `  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>`,
        "</cp:coreProperties>",
      ].join("")
    ),
    "docProps/app.xml": new TextEncoder().encode(
      [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/extended-properties\" xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\">",
        "  <Application>miniapps PDF Toolkit</Application>",
        "</Properties>",
      ].join("")
    ),
    "word/_rels/document.xml.rels": new TextEncoder().encode(
      [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>",
      ].join("")
    ),
    "word/styles.xml": new TextEncoder().encode(
      [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
        "  <w:docDefaults>",
        "    <w:rPrDefault>",
        "      <w:rPr>",
        "        <w:rFonts w:ascii=\"Arial\" w:hAnsi=\"Arial\" w:eastAsia=\"Arial\" w:cs=\"Arial\"/>",
        "        <w:sz w:val=\"22\"/>",
        "        <w:szCs w:val=\"22\"/>",
        "        <w:color w:val=\"1F2937\"/>",
        "      </w:rPr>",
        "    </w:rPrDefault>",
        "  </w:docDefaults>",
        "  <w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\">",
        "    <w:name w:val=\"Normal\"/>",
        "    <w:qFormat/>",
        "  </w:style>",
        "  <w:style w:type=\"paragraph\" w:styleId=\"BodyText\">",
        "    <w:name w:val=\"Body Text\"/>",
        "    <w:basedOn w:val=\"Normal\"/>",
        "    <w:pPr><w:spacing w:after=\"120\" w:line=\"320\" w:lineRule=\"auto\"/></w:pPr>",
        "  </w:style>",
        "  <w:style w:type=\"paragraph\" w:styleId=\"Heading1\">",
        "    <w:name w:val=\"Heading 1\"/>",
        "    <w:basedOn w:val=\"Normal\"/>",
        "    <w:qFormat/>",
        "    <w:pPr><w:spacing w:before=\"120\" w:after=\"140\"/></w:pPr>",
        "    <w:rPr>",
        "      <w:rFonts w:ascii=\"Arial\" w:hAnsi=\"Arial\" w:eastAsia=\"Arial\" w:cs=\"Arial\"/>",
        "      <w:b/>",
        "      <w:sz w:val=\"34\"/>",
        "      <w:szCs w:val=\"34\"/>",
        "      <w:color w:val=\"111827\"/>",
        "    </w:rPr>",
        "  </w:style>",
        "  <w:style w:type=\"paragraph\" w:styleId=\"Heading2\">",
        "    <w:name w:val=\"Heading 2\"/>",
        "    <w:basedOn w:val=\"Normal\"/>",
        "    <w:qFormat/>",
        "    <w:pPr><w:spacing w:before=\"100\" w:after=\"120\"/></w:pPr>",
        "    <w:rPr>",
        "      <w:rFonts w:ascii=\"Arial\" w:hAnsi=\"Arial\" w:eastAsia=\"Arial\" w:cs=\"Arial\"/>",
        "      <w:b/>",
        "      <w:sz w:val=\"28\"/>",
        "      <w:szCs w:val=\"28\"/>",
        "      <w:color w:val=\"1F2937\"/>",
        "    </w:rPr>",
        "  </w:style>",
        "</w:styles>",
      ].join("")
    ),
    "word/document.xml": new TextEncoder().encode(
      [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
        "<w:document xmlns:wpc=\"http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas\" xmlns:mc=\"http://schemas.openxmlformats.org/markup-compatibility/2006\" xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:m=\"http://schemas.openxmlformats.org/officeDocument/2006/math\" xmlns:v=\"urn:schemas-microsoft-com:vml\" xmlns:wp14=\"http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing\" xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\" xmlns:w10=\"urn:schemas-microsoft-com:office:word\" xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:w14=\"http://schemas.microsoft.com/office/word/2010/wordml\" xmlns:wpg=\"http://schemas.microsoft.com/office/word/2010/wordprocessingGroup\" xmlns:wpi=\"http://schemas.microsoft.com/office/word/2010/wordprocessingInk\" xmlns:wne=\"http://schemas.microsoft.com/office/word/2006/wordml\" xmlns:wps=\"http://schemas.microsoft.com/office/word/2010/wordprocessingShape\" mc:Ignorable=\"w14 wp14\">",
        "  <w:body>",
        bodyParts.join(""),
        "    <w:sectPr>",
        "      <w:pgSz w:w=\"11906\" w:h=\"16838\"/>",
        "      <w:pgMar w:top=\"1134\" w:right=\"1134\" w:bottom=\"1134\" w:left=\"1134\" w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/>",
        "    </w:sectPr>",
        "  </w:body>",
        "</w:document>",
      ].join("")
    ),
  };

  return zipSync(files, { level: 0 });
}

function extractPositionedTextItems(items: unknown[]): PositionedTextItem[] {
  return items
    .filter(isPdfTextItem)
    .map((item) => {
      const text = normalizeText(item.str);
      const transform = item.transform;
      const x = Number(transform[4] ?? 0);
      const y = Number(transform[5] ?? 0);
      const width = Math.max(Number(item.width ?? 0), text.length * 4);
      const fontSize = clamp(
        Math.max(Math.abs(Number(transform[0] ?? 0)), Math.abs(Number(transform[3] ?? 0)), item.height || 0),
        8,
        72
      );

      return { text, x, y, right: x + width, fontSize };
    })
    .filter((item) => item.text.length > 0)
    .sort((left, right) => {
      if (Math.abs(right.y - left.y) > 2) return right.y - left.y;
      return left.x - right.x;
    });
}

function groupPositionedItemsIntoLines(positioned: PositionedTextItem[]) {
  const lines: Array<{ y: number; parts: PositionedTextItem[]; fontSizes: number[] }> = [];

  for (const item of positioned) {
    const currentLine = lines[lines.length - 1];
    const threshold = currentLine ? Math.max(item.fontSize, median(currentLine.fontSizes)) * 0.55 : 0;
    if (!currentLine || Math.abs(currentLine.y - item.y) > threshold) {
      lines.push({ y: item.y, parts: [item], fontSizes: [item.fontSize] });
      continue;
    }

    currentLine.parts.push(item);
    currentLine.fontSizes.push(item.fontSize);
  }

  return lines;
}

function extractLinesFromTextContent(items: unknown[]): PdfTextLine[] {
  const positioned = extractPositionedTextItems(items);
  const lines = groupPositionedItemsIntoLines(positioned);

  return lines
    .map((line) => {
      const ordered = [...line.parts].sort((left, right) => left.x - right.x);
      const text = normalizeText(ordered.map((part) => part.text).join(" "));
      const fontSize = median(line.fontSizes);
      return { text, fontSize };
    })
    .filter((line) => line.text.length > 0);
}

function clusterColumnAnchors(rows: Array<Array<{ text: string; x: number }>>): number[] {
  const anchors = rows.flatMap((row) => row.map((cell) => cell.x)).sort((left, right) => left - right);
  const clusters: number[][] = [];

  for (const x of anchors) {
    const current = clusters[clusters.length - 1];
    if (!current || Math.abs(current[current.length - 1]! - x) > 24) {
      clusters.push([x]);
      continue;
    }

    current.push(x);
  }

  return clusters.map((cluster) => median(cluster));
}

function extractTableRowsFromTextContent(items: unknown[]): string[][] {
  const positioned = extractPositionedTextItems(items);
  const lineGroups = groupPositionedItemsIntoLines(positioned);

  const candidateRows = lineGroups
    .map((line) => {
      const ordered = [...line.parts].sort((left, right) => left.x - right.x);
      const cells: Array<{ text: string; x: number; right: number }> = [];

      for (const part of ordered) {
        const previous = cells[cells.length - 1];
        const gapThreshold = Math.max(part.fontSize * 1.35, 18);

        if (!previous || part.x - previous.right > gapThreshold) {
          cells.push({ text: part.text, x: part.x, right: part.right });
          continue;
        }

        previous.text = normalizeText(`${previous.text} ${part.text}`);
        previous.right = Math.max(previous.right, part.right);
      }

      return cells.filter((cell) => cell.text.length > 0);
    })
    .filter((row) => row.length >= 2);

  if (candidateRows.length === 0) {
    return [];
  }

  const anchors = clusterColumnAnchors(candidateRows.map((row) => row.map((cell) => ({ text: cell.text, x: cell.x }))));
  if (anchors.length < 2) {
    return [];
  }

  const rows = candidateRows
    .map((row) => {
      const mapped = Array.from({ length: anchors.length }, () => "");

      for (const cell of row) {
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        anchors.forEach((anchor, index) => {
          const distance = Math.abs(anchor - cell.x);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });

        mapped[nearestIndex] = mapped[nearestIndex]
          ? normalizeText(`${mapped[nearestIndex]} ${cell.text}`)
          : cell.text;
      }

      return mapped;
    })
    .filter((row) => row.filter((cell) => cell.trim().length > 0).length >= 2);

  if (rows.length === 0) {
    return [];
  }

  const lastNonEmptyIndex = Math.max(
    1,
    ...rows.flatMap((row) => row.map((cell, index) => (cell.trim().length > 0 ? index : -1)))
  );

  return rows.map((row) => row.slice(0, lastNonEmptyIndex + 1));
}

function classifyOcrBlock(text: string): ExtractedTextBlockKind {
  const words = text.split(/\s+/).filter(Boolean);
  const isUpperHeavy = text === text.toUpperCase() && /[A-ZÇĞİIÖŞÜ]/.test(text);

  if (words.length <= 8 && isUpperHeavy) {
    return "heading";
  }

  if (words.length <= 12 && !/[.!?:;]$/.test(text)) {
    return "subheading";
  }

  return "body";
}

function extractBlocksFromOcrText(text: string): ExtractedTextBlock[] {
  const blocks = text
    .split(/\n\s*\n+/)
    .map((part) => normalizeText(part))
    .filter((part) => part.length > 0);

  return blocks.map((textBlock) => ({
    kind: classifyOcrBlock(textBlock),
    text: textBlock,
  }));
}

export async function extractStructuredText(
  fileBytes: Uint8Array,
  pageIndices?: number[]
): Promise<ExtractedTextDocument> {
  const doc = await openPdfForPreview(fileBytes);

  try {
    const indices =
      pageIndices && pageIndices.length > 0
        ? [...pageIndices].sort((left, right) => left - right)
        : Array.from({ length: doc.numPages }, (_, index) => index);

    const pageLines = await Promise.all(
      indices.map(async (pageIndex) => {
        const page = await doc.getPage(pageIndex + 1);
        const content = await page.getTextContent();
        return {
          pageNumber: pageIndex + 1,
          lines: extractLinesFromTextContent(content.items),
        };
      })
    );

    const allFontSizes = pageLines.flatMap((page) => page.lines.map((line) => line.fontSize));
    const baseFontSize = median(allFontSizes);

    const pages = pageLines.map((page) => ({
      pageNumber: page.pageNumber,
      blocks: page.lines.map<ExtractedTextBlock>((line) => ({
        kind: classifyTextBlock(line.text, line.fontSize, baseFontSize),
        text: line.text,
      })),
    }));

    return {
      mode: "text-layer",
      pages,
      blockCount: pages.reduce((sum, page) => sum + page.blocks.length, 0),
      characterCount: pages.reduce(
        (sum, page) => sum + page.blocks.reduce((inner, block) => inner + block.text.length, 0),
        0
      ),
    };
  } finally {
    await doc.destroy();
  }
}

export async function extractStructuredTextWithOcr(
  fileBytes: Uint8Array,
  pageIndices?: number[],
  rotations?: Record<number, number>,
  onProgress?: (message: string) => void,
  progressCopy?: OcrProgressCopy
): Promise<ExtractedTextDocument> {
  const doc = await openPdfForPreview(fileBytes);
  const { createWorker } = await import("tesseract.js");
  onProgress?.(progressCopy?.preparing ?? "OCR motoru hazırlanıyor. İlk kullanımda dil modeli indirilebilir.");
  const worker = await createWorker(OCR_LANGUAGES, 1);

  try {
    const indices =
      pageIndices && pageIndices.length > 0
        ? [...pageIndices].sort((left, right) => left - right)
        : Array.from({ length: doc.numPages }, (_, index) => index);

    const pages = [];

    for (let index = 0; index < indices.length; index += 1) {
      const pageIndex = indices[index]!;
      onProgress?.(progressCopy?.page(index + 1, indices.length) ?? `OCR çalışıyor: sayfa ${index + 1} / ${indices.length}`);
      const page = await doc.getPage(pageIndex + 1);
      const rotation = rotations?.[pageIndex] ?? 0;
      const blob = await renderPageToBlob(page, rotation, "png", OCR_MAX_DIMENSION);
      const result = await worker.recognize(blob);

      pages.push({
        pageNumber: pageIndex + 1,
        blocks: extractBlocksFromOcrText(result.data.text),
      });
    }

    return {
      mode: "ocr",
      pages,
      blockCount: pages.reduce((sum, page) => sum + page.blocks.length, 0),
      characterCount: pages.reduce(
        (sum, page) => sum + page.blocks.reduce((inner, block) => inner + block.text.length, 0),
        0
      ),
    };
  } finally {
    onProgress?.(progressCopy?.done ?? "OCR tamamlandı.");
    await worker.terminate();
    await doc.destroy();
  }
}

export async function extractTablesFromPdf(
  fileBytes: Uint8Array,
  pageIndices?: number[],
  onProgress?: (message: string) => void,
  progressCopy?: TableProgressCopy
): Promise<ExtractedTableDocument> {
  const doc = await openPdfForPreview(fileBytes);

  try {
    const indices =
      pageIndices && pageIndices.length > 0
        ? [...pageIndices].sort((left, right) => left - right)
        : Array.from({ length: doc.numPages }, (_, index) => index);

    const pages: ExtractedTablePage[] = [];

    for (let index = 0; index < indices.length; index += 1) {
      const pageIndex = indices[index]!;
      onProgress?.(progressCopy?.page(index + 1, indices.length) ?? `Tablo analizi: sayfa ${index + 1} / ${indices.length}`);
      const page = await doc.getPage(pageIndex + 1);
      const content = await page.getTextContent();
      const rows = extractTableRowsFromTextContent(content.items);

      if (rows.length > 0) {
        pages.push({
          pageNumber: pageIndex + 1,
          rows,
          columnCount: Math.max(...rows.map((row) => row.length)),
        });
      }
    }

    return {
      pages,
      rowCount: pages.reduce((sum, page) => sum + page.rows.length, 0),
      maxColumnCount: pages.reduce((max, page) => Math.max(max, page.columnCount), 0),
    };
  } finally {
    onProgress?.(progressCopy?.done ?? "Tablo analizi tamamlandı.");
    await doc.destroy();
  }
}

export function buildExcelBlobFromExtractedTables(extracted: ExtractedTableDocument, sheetPrefix = "Sayfa"): Blob {
  const workbook = XLSX.utils.book_new();

  extracted.pages.forEach((page, index) => {
    const sheetName = `${sheetPrefix} ${page.pageNumber}`.slice(0, 31) || `Sheet${index + 1}`;
    const worksheet = XLSX.utils.aoa_to_sheet(page.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  const workbookBytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Blob([workbookBytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildCsvText(rows: string[][]): string {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  return XLSX.utils.sheet_to_csv(worksheet, { FS: ",", RS: "\n" });
}

export function buildCsvBlobsFromExtractedTables(
  extracted: ExtractedTableDocument
): Array<{ pageNumber: number; blob: Blob }> {
  return extracted.pages.map((page) => ({
    pageNumber: page.pageNumber,
    blob: new Blob(["\uFEFF", buildCsvText(page.rows)], { type: "text/csv;charset=utf-8;" }),
  }));
}

export function buildDocxFromExtractedText(extracted: ExtractedTextDocument): Uint8Array {
  return buildDocxXml(extracted);
}

export async function applyWatermark(
  fileBytes: Uint8Array,
  settings: WatermarkSettings,
  targetPageIndices: number[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(fileBytes, { throwOnInvalidObject: false, ignoreEncryption: true });
  const pages = doc.getPages();

  if (settings.type === "text") {
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const color = WATERMARK_COLORS[settings.color];

    for (const index of targetPageIndices) {
      const page = pages[index];
      if (!page) continue;
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(settings.text, settings.fontSize);
      const x = width / 2 - (textWidth / 2) * SQRT2_2 + (settings.fontSize / 2) * SQRT2_2;
      const y = height / 2 - (textWidth / 2) * SQRT2_2 - (settings.fontSize / 2) * SQRT2_2;
      page.drawText(settings.text, {
        x, y,
        size: settings.fontSize,
        font, color,
        opacity: settings.opacity,
        rotate: degrees(45),
      });
    }
  } else if (settings.type === "image" && settings.imageDataUrl) {
    const imgBytes = dataUrlToBytes(settings.imageDataUrl);
    const mimeType = getDataUrlMimeType(settings.imageDataUrl);
    const embeddedImage =
      mimeType === "image/jpeg" || mimeType === "image/jpg"
        ? await doc.embedJpg(imgBytes)
        : await doc.embedPng(imgBytes);
    const { width: imgW, height: imgH } = embeddedImage;
    const aspectRatio = imgH / imgW;

    for (const index of targetPageIndices) {
      const page = pages[index];
      if (!page) continue;
      const { width, height } = page.getSize();
      const drawWidth = width * settings.imageScale;
      const drawHeight = drawWidth * aspectRatio;
      // Döndürülmüş görselin merkezini sayfa merkezine hizala
      const x = width / 2 - (drawWidth / 2) * SQRT2_2 + (drawHeight / 2) * SQRT2_2;
      const y = height / 2 - (drawWidth / 2) * SQRT2_2 - (drawHeight / 2) * SQRT2_2;
      page.drawImage(embeddedImage, {
        x, y,
        width: drawWidth,
        height: drawHeight,
        opacity: settings.opacity,
        rotate: degrees(45),
      });
    }
  }

  return doc.save({ useObjectStreams: false });
}

export async function renderWatermarkPreviewPages(
  fileBytes: Uint8Array,
  settings: WatermarkSettings,
  targetPageIndices: number[],
  previewPageIndices: number[]
): Promise<string[]> {
  const watermarkedBytes = await applyWatermark(fileBytes, settings, targetPageIndices);
  const doc = await openPdfForPreview(watermarkedBytes);

  try {
    const thumbnails: string[] = [];

    for (const pageIndex of previewPageIndices) {
      thumbnails.push(await renderPageThumbnail(doc, pageIndex, 0));
    }

    return thumbnails;
  } finally {
    await doc.destroy();
  }
}

export function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([toArrayBuffer(bytes)], { type: "application/pdf" });
  downloadBlob(blob, fileName);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function zipFileName(fileName: string, fallback = "dosyalar"): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return `${base || fallback}.zip`;
}

export async function downloadBytesAsZip(
  entries: Array<{ fileName: string; bytes: Uint8Array }>,
  zipName: string
): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  const seen = new Map<string, number>();

  for (const entry of entries) {
    const base = entry.fileName.replace(/(\.[^.]+)$/, "");
    const ext = entry.fileName.match(/\.[^.]+$/)?.[0] ?? "";
    const count = seen.get(entry.fileName) ?? 0;
    const finalName = count === 0 ? entry.fileName : `${base}-${count}${ext}`;
    seen.set(entry.fileName, count + 1);
    files[finalName] = entry.bytes;
  }

  const zipped = zipSync(files, { level: 0 });
  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
  downloadBlob(blob, zipName);
}

export async function downloadBlobsAsZip(
  entries: Array<{ fileName: string; blob: Blob }>,
  zipName: string
): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  const seen = new Map<string, number>();

  for (const entry of entries) {
    const base = entry.fileName.replace(/(\.[^.]+)$/, "");
    const ext = entry.fileName.match(/\.[^.]+$/)?.[0] ?? "";
    const count = seen.get(entry.fileName) ?? 0;
    const finalName = count === 0 ? entry.fileName : `${base}-${count}${ext}`;
    seen.set(entry.fileName, count + 1);
    files[finalName] = new Uint8Array(await entry.blob.arrayBuffer());
  }

  const zipped = zipSync(files, { level: 0 });
  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
  downloadBlob(blob, zipName);
}

export function createDocxBlob(bytes: Uint8Array): Blob {
  return new Blob([toArrayBuffer(bytes)], {
    type: DOCX_MIME,
  });
}
