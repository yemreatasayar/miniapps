import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { ExtractedTextDocument } from "./types";

function mapBlockToParagraph(kind: "heading" | "subheading" | "body", text: string): Paragraph {
  if (kind === "heading") {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 180, after: 120, line: 320 },
      children: [new TextRun({ text, font: "Arial", bold: true, size: 30 })],
    });
  }

  if (kind === "subheading") {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 140, after: 90, line: 300 },
      children: [new TextRun({ text, font: "Arial", bold: true, size: 25 })],
    });
  }

  return new Paragraph({
    spacing: { after: 110, line: 320 },
    children: [new TextRun({ text, font: "Arial", size: 22 })],
  });
}

export async function buildDocxBlobFromExtractedText(
  extracted: ExtractedTextDocument,
  title = "PDF Text Extract",
  emptyText = "Çıkarılabilir metin bulunamadı."
): Promise<Blob> {
  const children: Paragraph[] = [];

  extracted.pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      children.push(
        new Paragraph({
          children: [],
          pageBreakBefore: true,
        })
      );
    }

    page.blocks.forEach((block) => {
      children.push(mapBlockToParagraph(block.kind, block.text));
    });
  });

  const doc = new Document({
    creator: "miniapps PDF Toolkit",
    title,
    description: "PDF text extraction output",
    sections: [
      {
        properties: {},
        children:
          children.length > 0
            ? children
            : [
                new Paragraph({
                  children: [new TextRun({ text: emptyText, font: "Arial", size: 22 })],
                }),
              ],
      },
    ],
    styles: {
      default: {
        document: {
          run: {
            font: "Arial",
            size: 22,
            color: "1F2937",
          },
          paragraph: {
            spacing: {
              line: 320,
              after: 110,
            },
          },
        },
      },
    },
  });

  return Packer.toBlob(doc);
}
