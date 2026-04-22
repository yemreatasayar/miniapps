import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, registerFont } from "canvas";
import * as XLSX from "xlsx";
import fontkit from "@pdf-lib/fontkit";
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFString, rgb } from "pdf-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const samplesDir = path.join(rootDir, "samples");
const imagesDir = path.join(samplesDir, "images");
const fontsDir = path.join(rootDir, "public", "fonts");

registerFont(path.join(fontsDir, "Montserrat-Medium.ttf"), { family: "Montserrat", weight: "500" });
registerFont(path.join(fontsDir, "Montserrat-SemiBold.ttf"), { family: "Montserrat", weight: "600" });
registerFont(path.join(fontsDir, "Montserrat-ExtraBold.ttf"), { family: "Montserrat", weight: "800" });

const PX_TO_PT = 0.75;
const DOCUMENT_WIDTH = 1080;
const WHITE_PANEL_X = 42;
const WHITE_PANEL_Y = 500;
const WHITE_PANEL_WIDTH = 996;
const CONTENT_X = 86;
const CONTENT_WIDTH = 908;
const IMAGE_X = 70;
const IMAGE_WIDTH = 940;
const IMAGE_HEIGHT = 456;
const BLOCK_GAP = 72;
const LINK_LABEL = "Tamamini okumak icin tiklayin";

const TITLE_STYLE = { fontFamily: "Montserrat", fontSize: 45, fontWeight: 800, lineHeight: 54, color: "#111827" };
const META_STYLE = { fontFamily: "Montserrat", fontSize: 22, fontWeight: 600, lineHeight: 26, color: "#2f3b62" };
const SUMMARY_STYLE = { fontFamily: "Montserrat", fontSize: 25, fontWeight: 500, lineHeight: 32, color: "#20263a" };
const LINK_STYLE = { fontFamily: "Montserrat", fontSize: 24, fontWeight: 700, lineHeight: 28, color: "#1537c4" };
const HEADER_TITLE_STYLE = { fontFamily: "Montserrat", fontSize: 78, fontWeight: 800, lineHeight: 82, color: "#ffffff" };
const HEADER_SUBTITLE_STYLE = { fontFamily: "Montserrat", fontSize: 28, fontWeight: 500, lineHeight: 34, color: "#d7deff" };
const INTRO_STYLE = { fontFamily: "Montserrat", fontSize: 25, fontWeight: 500, lineHeight: 31, color: "#ffffff" };
const FOOTER_TITLE_STYLE = { fontFamily: "Montserrat", fontSize: 36, fontWeight: 800, lineHeight: 42, color: "#ffffff" };
const FOOTER_TEXT_STYLE = { fontFamily: "Montserrat", fontSize: 20, fontWeight: 500, lineHeight: 28, color: "#d5dcff" };

const sampleRows = [
  {
    title: "COP31'e Giderken: Iklim Adaleti mi, Savasin Enerji Rejimi mi?",
    summary:
      "Bu ornek metin, mini app icindeki uzun belge akisini gormek icin olusturuldu. Baslik ve ozet kesilmez; metin uzadikca belge asagi dogru buyur.",
    source: "BirGun",
    author: "Aziz Celik",
    date: "10 Nisan 2026",
    link: "https://example.com/haber-1",
    image_name: "ornek-haber-1.jpg",
  },
  {
    title: "Guvensizlik ve Hukuksuzluk Girdabinda TUIK Garabeti",
    summary:
      "Excel importu ile title, summary, source, author, date, link ve image_name alanlari otomatik okunur. Gorseller toplu yuklenir ve birebir dosya adi ile eslestirilir.",
    source: "Evrensel",
    author: "Umit Akcay",
    date: "9 Nisan 2026",
    link: "https://example.com/haber-2",
    image_name: "ornek-haber-2.jpg",
  },
  {
    title: "Montrö'nun Cignenmeyecek Iki Ilkesi",
    summary:
      "PDF export tek uzun sayfa olarak uretilir. Browser print zincirine girmez; linkler PDF annotation olarak eklendigi icin dosya icinde tiklanabilir kalir.",
    source: "soL Haber",
    author: "Editor",
    date: "8 Nisan 2026",
    link: "https://example.com/haber-3",
    image_name: "ornek-haber-3.jpg",
  },
];

function px(value) {
  return value * PX_TO_PT;
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const parts = normalized.match(/.{1,2}/g) ?? ["00", "00", "00"];
  return parts.slice(0, 3).map((part) => Number.parseInt(part, 16) / 255);
}

function buildFont(style) {
  return `${style.fontWeight} ${style.fontSize}px "${style.fontFamily}"`;
}

const measureCanvas = createCanvas(10, 10);
const measureCtx = measureCanvas.getContext("2d");

function measureText(text, style) {
  measureCtx.font = buildFont(style);
  return measureCtx.measureText(text).width;
}

function breakLongWord(word, maxWidth, style) {
  const parts = [];
  let current = "";
  for (const char of word) {
    const candidate = current + char;
    if (current && measureText(candidate, style) > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function wrapText(text, maxWidth, style) {
  const paragraphs = String(text).replace(/\r/g, "").split("\n");
  const lines = [];
  let widest = 0;

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    const words = paragraph.split(/\s+/);
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureText(candidate, style) <= maxWidth) {
        current = candidate;
        widest = Math.max(widest, measureText(candidate, style));
        continue;
      }

      if (current) lines.push(current);
      if (measureText(word, style) <= maxWidth) {
        current = word;
        widest = Math.max(widest, measureText(word, style));
        continue;
      }

      const chunks = breakLongWord(word, maxWidth, style);
      for (let index = 0; index < chunks.length - 1; index += 1) {
        lines.push(chunks[index]);
      }
      current = chunks[chunks.length - 1] ?? "";
      widest = Math.max(widest, measureText(current, style));
    }

    lines.push(current);
  }

  return {
    lines,
    width: widest,
    height: lines.length * style.lineHeight,
  };
}

function fitSingleLine(text, maxWidth, baseStyle) {
  let fontSize = baseStyle.fontSize;
  let lineHeight = baseStyle.lineHeight;
  let width = measureText(text, baseStyle);

  while (width > maxWidth && fontSize > 16) {
    fontSize -= 1;
    lineHeight = Math.round((baseStyle.lineHeight * fontSize) / baseStyle.fontSize);
    width = measureText(text, { ...baseStyle, fontSize, lineHeight });
  }

  return {
    lines: [text],
    width,
    height: lineHeight,
    fontSize,
  };
}

function buildLayout(rows) {
  let cursorY = WHITE_PANEL_Y + 78;
  const newsLayouts = rows.map((row) => {
    const titleWrapped = wrapText(row.title, CONTENT_WIDTH, TITLE_STYLE);
    const metaText = [row.source, row.author, row.date].filter(Boolean).join(" | ");
    const metaWrapped = fitSingleLine(metaText, CONTENT_WIDTH, META_STYLE);
    const summaryWrapped = wrapText(row.summary, CONTENT_WIDTH, SUMMARY_STYLE);
    const titleY = cursorY;
    const metaY = titleY + titleWrapped.height + 34;
    const imageY = metaY + metaWrapped.height + 38;
    const summaryY = imageY + IMAGE_HEIGHT + 58;
    const linkY = summaryY + summaryWrapped.height + 44;
    const dividerY = linkY + 72;
    const height = dividerY - titleY + 2;
    cursorY = dividerY + BLOCK_GAP;

    return {
      row,
      title: { ...titleWrapped, x: CONTENT_X, y: titleY },
      meta: { ...metaWrapped, x: CONTENT_X, y: metaY, text: metaText },
      image: { x: IMAGE_X, y: imageY, width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
      summary: { ...summaryWrapped, x: CONTENT_X, y: summaryY },
      link: { x: CONTENT_X, y: linkY - 18, width: Math.max(310, measureText(LINK_LABEL, LINK_STYLE) + 40), height: 56 },
      divider: { x: CONTENT_X, y: dividerY, width: 240, height: 2 },
      height,
    };
  });

  const intro = wrapText(
    "Ulke ve dunya gundemine dair derlenen haber, makale ve degerlendirmeleri tek parca, uzun bir bulten tasarimi icinde toparlamak icin hazirlandi.",
    740,
    INTRO_STYLE
  );
  const footerTitle = wrapText("Filtre / MMO", 420, FOOTER_TITLE_STYLE);
  const footerText = wrapText(
    "Bu ornek export, mini app icindeki PDF motorunun tek uzun boyut ve tiklanabilir link annotation mantigini gostermek icin uretilmistir.",
    740,
    FOOTER_TEXT_STYLE
  );
  const footerTop = cursorY + 52;

  return {
    height: footerTop + footerTitle.height + footerText.height + 118,
    newsLayouts,
    intro,
    footerTop,
    footerTitle,
    footerText,
  };
}

async function createSampleImages() {
  await fs.mkdir(imagesDir, { recursive: true });
  const colors = ["#ccdbff", "#cdebd8", "#ffe2bf"];

  for (const [index, row] of sampleRows.entries()) {
    const canvas = createCanvas(1200, 640);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#16329b";
    ctx.font = '800 56px "Montserrat"';
    ctx.fillText(`Ornek Gorsel ${index + 1}`, 72, 140);
    ctx.fillStyle = "#243050";
    ctx.font = '500 34px "Montserrat"';
    const title = row.title.slice(0, 42);
    ctx.fillText(title, 72, 220);
    const outputPath = path.join(imagesDir, row.image_name);
    await fs.writeFile(outputPath, canvas.toBuffer("image/jpeg", { quality: 0.88 }));
  }
}

async function createExcelTemplate() {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "bulten");
  XLSX.writeFile(workbook, path.join(samplesDir, "weekly-bulletin-template.xlsx"));
}

function addLinkAnnotation(page, layoutHeight, rect, url) {
  const context = page.doc.context;
  const annotation = context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [
      PDFNumber.of(px(rect.x)),
      PDFNumber.of(px(layoutHeight - rect.y - rect.height)),
      PDFNumber.of(px(rect.x + rect.width)),
      PDFNumber.of(px(layoutHeight - rect.y)),
    ],
    Border: [0, 0, 0],
    A: {
      Type: "Action",
      S: "URI",
      URI: PDFString.of(url),
    },
  });
  const ref = context.register(annotation);
  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray) ?? context.obj([]);
  annots.push(ref);
  page.node.set(PDFName.of("Annots"), annots);
}

async function createPdfSample() {
  const layout = buildLayout(sampleRows);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const [mediumBytes, semiboldBytes, extraBoldBytes] = await Promise.all([
    fs.readFile(path.join(fontsDir, "Montserrat-Medium.ttf")),
    fs.readFile(path.join(fontsDir, "Montserrat-SemiBold.ttf")),
    fs.readFile(path.join(fontsDir, "Montserrat-ExtraBold.ttf")),
  ]);

  const mediumFont = await pdfDoc.embedFont(mediumBytes);
  const semiboldFont = await pdfDoc.embedFont(semiboldBytes);
  const extraBoldFont = await pdfDoc.embedFont(extraBoldBytes);
  const page = pdfDoc.addPage([px(DOCUMENT_WIDTH), px(layout.height)]);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: px(DOCUMENT_WIDTH),
    height: px(layout.height),
    color: rgb(...hexToRgb("#101a63")),
  });

  page.drawRectangle({
    x: px(WHITE_PANEL_X),
    y: px(layout.height - WHITE_PANEL_Y - (layout.footerTop - WHITE_PANEL_Y - 30)),
    width: px(WHITE_PANEL_WIDTH),
    height: px(layout.footerTop - WHITE_PANEL_Y - 30),
    color: rgb(1, 1, 1),
  });

  page.drawRectangle({
    x: px(44),
    y: px(layout.height - 270 - 190),
    width: px(992),
    height: px(190),
    color: rgb(1, 1, 1),
    opacity: 0.08,
    borderColor: rgb(1, 1, 1),
    borderWidth: px(2),
  });

  page.drawText("Filtre", {
    x: px(72),
    y: px(layout.height - 86 - HEADER_TITLE_STYLE.fontSize),
    size: px(HEADER_TITLE_STYLE.fontSize),
    font: extraBoldFont,
    color: rgb(...hexToRgb("#ffffff")),
  });

  page.drawText("Haftalik Sube Bulteni", {
    x: px(428),
    y: px(layout.height - 170 - HEADER_SUBTITLE_STYLE.fontSize),
    size: px(HEADER_SUBTITLE_STYLE.fontSize),
    font: mediumFont,
    color: rgb(...hexToRgb("#d7deff")),
  });

  layout.intro.lines.forEach((line, index) => {
    page.drawText(line, {
      x: px(170),
      y: px(layout.height - 310 - index * INTRO_STYLE.lineHeight - INTRO_STYLE.fontSize),
      size: px(INTRO_STYLE.fontSize),
      font: mediumFont,
      color: rgb(...hexToRgb("#ffffff")),
    });
  });

  for (const [index, itemLayout] of layout.newsLayouts.entries()) {
    const row = sampleRows[index];
    const imageBytes = await fs.readFile(path.join(imagesDir, row.image_name));
    const image = await pdfDoc.embedJpg(imageBytes);

    itemLayout.title.lines.forEach((line, lineIndex) => {
      page.drawText(line, {
        x: px(itemLayout.title.x),
        y: px(layout.height - itemLayout.title.y - lineIndex * TITLE_STYLE.lineHeight - TITLE_STYLE.fontSize),
        size: px(TITLE_STYLE.fontSize),
        font: extraBoldFont,
        color: rgb(...hexToRgb(TITLE_STYLE.color)),
      });
    });

    page.drawText(itemLayout.meta.text, {
      x: px(itemLayout.meta.x),
      y: px(layout.height - itemLayout.meta.y - itemLayout.meta.fontSize),
      size: px(itemLayout.meta.fontSize),
      font: semiboldFont,
      color: rgb(...hexToRgb(META_STYLE.color)),
    });

    page.drawImage(image, {
      x: px(itemLayout.image.x),
      y: px(layout.height - itemLayout.image.y - itemLayout.image.height),
      width: px(itemLayout.image.width),
      height: px(itemLayout.image.height),
    });

    itemLayout.summary.lines.forEach((line, lineIndex) => {
      page.drawText(line, {
        x: px(itemLayout.summary.x),
        y: px(layout.height - itemLayout.summary.y - lineIndex * SUMMARY_STYLE.lineHeight - SUMMARY_STYLE.fontSize),
        size: px(SUMMARY_STYLE.fontSize),
        font: mediumFont,
        color: rgb(...hexToRgb(SUMMARY_STYLE.color)),
      });
    });

    page.drawRectangle({
      x: px(itemLayout.link.x),
      y: px(layout.height - itemLayout.link.y - itemLayout.link.height),
      width: px(itemLayout.link.width),
      height: px(itemLayout.link.height),
      color: rgb(...hexToRgb("#eef3ff")),
      borderColor: rgb(...hexToRgb("#c9d6ff")),
      borderWidth: px(1),
    });

    page.drawText(LINK_LABEL, {
      x: px(itemLayout.link.x + 20),
      y: px(layout.height - itemLayout.link.y - 18 - LINK_STYLE.fontSize),
      size: px(LINK_STYLE.fontSize),
      font: semiboldFont,
      color: rgb(...hexToRgb(LINK_STYLE.color)),
    });

    addLinkAnnotation(page, layout.height, itemLayout.link, row.link);

    page.drawRectangle({
      x: px(itemLayout.divider.x),
      y: px(layout.height - itemLayout.divider.y - itemLayout.divider.height),
      width: px(itemLayout.divider.width),
      height: px(itemLayout.divider.height),
      color: rgb(...hexToRgb("#d0d4de")),
    });
  }

  layout.footerTitle.lines.forEach((line, index) => {
    page.drawText(line, {
      x: px(72),
      y: px(layout.height - layout.footerTop - index * FOOTER_TITLE_STYLE.lineHeight - FOOTER_TITLE_STYLE.fontSize),
      size: px(FOOTER_TITLE_STYLE.fontSize),
      font: extraBoldFont,
      color: rgb(...hexToRgb(FOOTER_TITLE_STYLE.color)),
    });
  });

  const footerTextTop = layout.footerTop + layout.footerTitle.height + 22;
  layout.footerText.lines.forEach((line, index) => {
    page.drawText(line, {
      x: px(72),
      y: px(layout.height - footerTextTop - index * FOOTER_TEXT_STYLE.lineHeight - FOOTER_TEXT_STYLE.fontSize),
      size: px(FOOTER_TEXT_STYLE.fontSize),
      font: mediumFont,
      color: rgb(...hexToRgb(FOOTER_TEXT_STYLE.color)),
    });
  });

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(path.join(samplesDir, "sample-export.pdf"), Buffer.from(pdfBytes));
}

async function main() {
  await createSampleImages();
  await createExcelTemplate();
  await createPdfSample();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
