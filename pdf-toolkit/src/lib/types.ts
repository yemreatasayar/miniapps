export type PdfPage = {
  pageIndex: number;
  rotation: number;
  thumbnail: string;
};

export type LoadedPdf = {
  fileName: string;
  fileBytes: Uint8Array;
  pages: PdfPage[];
};

export type CompressPreset = "web" | "balanced" | "strong";

export type ImageExportFormat = "png" | "jpg" | "pdf";

export type CompressStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "success";
      sizeOriginal: number;
      sizeResult: number;
      downloadUrl: string;
      fileName: string;
    }
  | { kind: "error"; message: string }
  | { kind: "unavailable" }
  | { kind: "web-disabled"; message: string };

export type ActiveTab = "edit" | "convert" | "text" | "table" | "compress" | "watermark";
export type TextExtractMode = "text-layer" | "ocr";

export type ExtractedTextBlockKind = "heading" | "subheading" | "body";

export type ExtractedTextBlock = {
  kind: ExtractedTextBlockKind;
  text: string;
};

export type ExtractedTextPage = {
  pageNumber: number;
  blocks: ExtractedTextBlock[];
};

export type ExtractedTextDocument = {
  mode: TextExtractMode;
  pages: ExtractedTextPage[];
  blockCount: number;
  characterCount: number;
};

export type ExtractedTablePage = {
  pageNumber: number;
  rows: string[][];
  columnCount: number;
};

export type ExtractedTableDocument = {
  pages: ExtractedTablePage[];
  rowCount: number;
  maxColumnCount: number;
};

export type WatermarkType = "text" | "image";
export type WatermarkColor = "white" | "black" | "gray";
export type WatermarkTarget = "all" | "selected";

export type WatermarkSettings = {
  type: WatermarkType;
  // metin
  text: string;
  fontSize: number;
  color: WatermarkColor;
  // görsel
  imageDataUrl: string | null;  // PNG data URL (SVG'ler canvas'ta PNG'ye çevrilir)
  imageFileName: string | null;
  imageScale: number;           // 0.1–0.9, sayfa genişliğine oranı
  // ortak
  opacity: number;
  target: WatermarkTarget;
};
