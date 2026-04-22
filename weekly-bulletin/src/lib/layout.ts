import {
  BLOCK_GAP,
  CONTENT_WIDTH,
  CONTENT_X,
  DATE_STYLE,
  DOCUMENT_WIDTH,
  HEADER_BADGE_HEIGHT,
  HEADER_BADGE_WIDTH,
  HEADER_BADGE_X,
  HEADER_BADGE_Y,
  HEADER_LOGO_HEIGHT,
  HEADER_LOGO_WIDTH,
  HEADER_LOGO_Y,
  IMAGE_HEIGHT,
  IMAGE_RADIUS,
  IMAGE_WIDTH,
  IMAGE_X,
  INTRO_STYLE,
  LINK_LABEL,
  LINK_STYLE,
  META_STYLE,
  SECTION_VERTICAL_GAP,
  SUMMARY_STYLE,
  TITLE_STYLE,
  WHITE_PANEL_RADIUS,
  WHITE_PANEL_WIDTH,
  WHITE_PANEL_X,
  WHITE_PANEL_Y,
} from "./constants";
import { buildMetaLine, normalizeSummaryHtml, resolveImage, sanitizeLink, summaryTextToHtml } from "./format";
import { BulletinDocument, BulletinLayout, LayoutTextStyle, NewsItem, WrappedText } from "./types";

export type TextMeasure = (text: string, style: LayoutTextStyle) => number;

function buildFont(style: LayoutTextStyle): string {
  return `${style.fontStyle ?? "normal"} ${style.fontWeight} ${style.fontSize}px "${style.fontFamily}", sans-serif`;
}

export function createCanvasTextMeasurer(): TextMeasure {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas metin ölçümü başlatılamadı.");
  }

  return (text, style) => {
    ctx.font = buildFont(style);
    const width = ctx.measureText(text).width;
    const spacing = style.letterSpacing ?? 0;
    return width + Math.max(0, text.length - 1) * spacing;
  };
}

function breakLongWord(word: string, maxWidth: number, style: LayoutTextStyle, measure: TextMeasure): string[] {
  const parts: string[] = [];
  let current = "";

  for (const char of word) {
    const candidate = `${current}${char}`;
    if (current && measure(candidate, style) > maxWidth) {
      parts.push(current);
      current = char;
      continue;
    }
    current = candidate;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

export function wrapText(text: string, maxWidth: number, style: LayoutTextStyle, measure: TextMeasure): WrappedText {
  const normalized = text.replace(/\r/g, "");
  const paragraphs = normalized.split("\n");
  const lines: string[] = [];
  let maxMeasuredWidth = 0;

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    const words = paragraph.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;

      if (measure(candidate, style) <= maxWidth) {
        currentLine = candidate;
        maxMeasuredWidth = Math.max(maxMeasuredWidth, measure(candidate, style));
        continue;
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      if (measure(word, style) <= maxWidth) {
        currentLine = word;
        maxMeasuredWidth = Math.max(maxMeasuredWidth, measure(word, style));
        continue;
      }

      const chunks = breakLongWord(word, maxWidth, style, measure);
      for (let index = 0; index < chunks.length - 1; index += 1) {
        const chunk = chunks[index];
        lines.push(chunk);
        maxMeasuredWidth = Math.max(maxMeasuredWidth, measure(chunk, style));
      }
      currentLine = chunks[chunks.length - 1] ?? "";
      maxMeasuredWidth = Math.max(maxMeasuredWidth, measure(currentLine, style));
    }

    lines.push(currentLine);
  }

  const collapsed = lines.length > 0 ? lines : [""];

  return {
    lines: collapsed,
    width: Math.min(maxWidth, maxMeasuredWidth),
    height: collapsed.length * style.lineHeight,
    fontSize: style.fontSize,
  };
}

function fitSingleLine(text: string, maxWidth: number, baseStyle: LayoutTextStyle, measure: TextMeasure): WrappedText {
  let fontSize = baseStyle.fontSize;
  let lineHeight = baseStyle.lineHeight;
  let measuredWidth = measure(text, baseStyle);

  while (measuredWidth > maxWidth && fontSize > 16) {
    fontSize -= 1;
    lineHeight = Math.max(18, Math.round((baseStyle.lineHeight * fontSize) / baseStyle.fontSize));
    measuredWidth = measure(text, { ...baseStyle, fontSize, lineHeight });
  }

  return {
    lines: [text],
    width: Math.min(maxWidth, measuredWidth),
    height: lineHeight,
    fontSize,
  };
}

function buildTitleText(item: NewsItem): string {
  return item.title.trim() || "Boş başlık";
}

function buildSummaryText(item: NewsItem): string {
  return item.summary.trim() || "Özet girilmediği için bu örnek metin gösteriliyor.";
}

function buildSummaryHtml(item: NewsItem): string {
  return normalizeSummaryHtml(item) || summaryTextToHtml(buildSummaryText(item));
}

let richTextMeasureElement: HTMLDivElement | null = null;

function getRichTextMeasureElement(): HTMLDivElement {
  if (!richTextMeasureElement) {
    richTextMeasureElement = document.createElement("div");
    richTextMeasureElement.style.position = "absolute";
    richTextMeasureElement.style.left = "-99999px";
    richTextMeasureElement.style.top = "0";
    richTextMeasureElement.style.visibility = "hidden";
    richTextMeasureElement.style.pointerEvents = "none";
    richTextMeasureElement.style.whiteSpace = "normal";
    richTextMeasureElement.style.wordBreak = "break-word";
    richTextMeasureElement.style.overflowWrap = "anywhere";
    document.body.appendChild(richTextMeasureElement);
  }

  return richTextMeasureElement;
}

function measureRichTextBlock(html: string, width: number, style: LayoutTextStyle): WrappedText {
  const element = getRichTextMeasureElement();
  element.style.width = `${width}px`;
  element.style.fontFamily = `"${style.fontFamily}", sans-serif`;
  element.style.fontSize = `${style.fontSize}px`;
  element.style.fontWeight = String(style.fontWeight);
  element.style.fontStyle = style.fontStyle ?? "normal";
  element.style.lineHeight = `${style.lineHeight}px`;
  element.style.color = style.color ?? "#111111";
  element.style.textAlign = style.textAlign ?? "left";
  element.innerHTML = `
    <style>
      .rich-summary-root { margin: 0; padding: 0; }
      .rich-summary-root p,
      .rich-summary-root div { margin: 0 0 0.95em; }
      .rich-summary-root p:last-child,
      .rich-summary-root div:last-child { margin-bottom: 0; }
    </style>
    <div class="rich-summary-root">${html}</div>
  `;

  return {
    lines: [],
    width,
    height: Math.max(style.lineHeight, Math.ceil(element.getBoundingClientRect().height)),
    fontSize: style.fontSize,
  };
}

function buildIntroText(document: BulletinDocument): string {
  return document.introText.trim() || "Giriş metni buraya gelir.";
}

export function buildBulletinLayout(document: BulletinDocument, measure: TextMeasure): BulletinLayout {
  const introWrapped = wrapText(buildIntroText(document), IMAGE_WIDTH, INTRO_STYLE, measure);
  const headerLogoX = (DOCUMENT_WIDTH - HEADER_LOGO_WIDTH) / 2;
  const introBoxPaddingY = 28;
  const introBoxHeight = Math.max(HEADER_BADGE_HEIGHT, introWrapped.height + introBoxPaddingY * 2);
  const introTextY = HEADER_BADGE_Y + introBoxPaddingY;
  const whitePanelY = HEADER_BADGE_Y + introBoxHeight + SECTION_VERTICAL_GAP;

  let cursorY = whitePanelY + 78;

  const newsLayouts = document.newsItems.map((item) => {
    const titleWrapped = wrapText(buildTitleText(item), CONTENT_WIDTH, TITLE_STYLE, measure);
    const metaText = buildMetaLine(item);
    const dateText = item.date.trim() || "Tarih";
    const linkLabel = item.linkLabel?.trim() || LINK_LABEL;
    const metaWrapped = fitSingleLine(metaText, CONTENT_WIDTH, META_STYLE, measure);
    const dateWrapped = fitSingleLine(dateText, CONTENT_WIDTH, DATE_STYLE, measure);
    const metaStyle = {
      ...META_STYLE,
      fontSize: metaWrapped.fontSize,
      lineHeight: metaWrapped.height,
    };
    const dateStyle = {
      ...DATE_STYLE,
      fontSize: dateWrapped.fontSize,
      lineHeight: dateWrapped.height,
    };
    const summaryFontSize = item.summaryFontSize ?? SUMMARY_STYLE.fontSize;
    const summaryLineHeight = Math.round(SUMMARY_STYLE.lineHeight * summaryFontSize / SUMMARY_STYLE.fontSize);
    const summaryStyle = {
      ...SUMMARY_STYLE,
      fontSize: summaryFontSize,
      lineHeight: summaryLineHeight,
      fontStyle: "normal" as const,
      textAlign: "left" as const,
    };
    const summaryHtml = buildSummaryHtml(item);
    const summaryWrapped = measureRichTextBlock(summaryHtml, CONTENT_WIDTH, summaryStyle);
    const titleY = cursorY;
    const imageY = titleY + titleWrapped.height + 34;
    const metaRowY = imageY + IMAGE_HEIGHT + 26;
    const dateY = metaRowY + (metaText ? metaWrapped.height + 10 : 0);
    const dividerY = dateY + dateWrapped.height + 18;
    const summaryY = dividerY + 30;
    const linkY = summaryY + summaryWrapped.height + 58;
    const linkWidth = Math.max(310, measure(linkLabel, LINK_STYLE) + 40);
    const blockBottomY = linkY + 56;
    const height = blockBottomY - titleY;

    const layout = {
      id: item.id,
      top: titleY,
      height,
      title: {
        x: CONTENT_X,
        y: titleY,
        width: CONTENT_WIDTH,
        text: titleWrapped.lines.join("\n"),
        style: TITLE_STYLE,
        wrapped: titleWrapped,
      },
      imageRect: {
        x: IMAGE_X,
        y: imageY,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        radius: IMAGE_RADIUS,
        fill: resolveImage(document, item.imageName) ? "#dbe5ff" : "#c7cedd",
      },
      meta: {
        x: CONTENT_X,
        y: metaRowY,
        width: CONTENT_WIDTH,
        text: metaText,
        style: metaStyle,
        wrapped: metaWrapped,
      },
      date: {
        x: CONTENT_X,
        y: dateY,
        width: CONTENT_WIDTH,
        text: dateText,
        style: dateStyle,
        wrapped: dateWrapped,
      },
      summary: {
        x: CONTENT_X,
        y: summaryY,
        width: CONTENT_WIDTH,
        text: buildSummaryText(item),
        html: summaryHtml,
        style: summaryStyle,
        wrapped: summaryWrapped,
      },
      linkRect: {
        x: CONTENT_X,
        y: linkY - 18,
        width: linkWidth,
        height: 56,
        radius: 18,
        fill: "#f4f4f4",
      },
      linkText: {
        x: CONTENT_X + 20,
        y: linkY,
        width: linkWidth - 40,
        text: linkLabel,
        style: LINK_STYLE,
        wrapped: fitSingleLine(linkLabel, linkWidth - 40, LINK_STYLE, measure),
      },
      divider: {
        x: CONTENT_X,
        y: dividerY,
        width: 228,
        height: 1,
        fill: "#d0d4de",
      },
      link: sanitizeLink(item.link),
      imageName: item.imageName,
    };

    cursorY = blockBottomY + BLOCK_GAP;
    return layout;
  });

  const footerTop = cursorY;
  const whitePanelHeight = footerTop - whitePanelY;
  const footerBottom = whitePanelY + whitePanelHeight + SECTION_VERTICAL_GAP;

  return {
    width: DOCUMENT_WIDTH,
    height: footerBottom,
    whitePanel: {
      x: WHITE_PANEL_X,
      y: whitePanelY,
      width: WHITE_PANEL_WIDTH,
      height: whitePanelHeight,
      radius: WHITE_PANEL_RADIUS,
      fill: "#ffffff",
    },
    headerBadge: {
      x: HEADER_BADGE_X,
      y: HEADER_BADGE_Y,
      width: HEADER_BADGE_WIDTH,
      height: introBoxHeight,
      radius: 36,
      fill: "transparent",
      stroke: "#ffffff",
      strokeWidth: 2,
    },
    headerLogo: {
      x: headerLogoX,
      y: HEADER_LOGO_Y,
      width: HEADER_LOGO_WIDTH,
      height: HEADER_LOGO_HEIGHT,
    },
    intro: {
      x: IMAGE_X,
      y: introTextY,
      width: IMAGE_WIDTH,
      text: introWrapped.lines.join("\n"),
      style: INTRO_STYLE,
      wrapped: introWrapped,
    },
    footerLogo: null,
    newsLayouts,
  };
}
