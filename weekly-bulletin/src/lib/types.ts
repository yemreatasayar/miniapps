export type ImageAsset = {
  name: string;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string;
};

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  summaryHtml: string;
  summaryFontSize: number;
  summaryBold: boolean;
  summaryItalic: boolean;
  summaryAlign: "left" | "center" | "right";
  linkLabel: string;
  source: string;
  author: string;
  date: string;
  link: string;
  imageName: string;
};

export type BulletinDocument = {
  id: string;
  name: string;
  issueLabel: string;
  introText: string;
  footerTitle: string;
  footerText: string;
  newsItems: NewsItem[];
  uploadedImages: ImageAsset[];
  createdAt: string;
  updatedAt: string;
};

export type StoredDocument = {
  id: string;
  kind: "draft" | "saved";
  createdAt: string;
  updatedAt: string;
  document: BulletinDocument;
};

export type LayoutTextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  fontStyle?: "normal" | "italic";
  letterSpacing?: number;
  color?: string;
  textAlign?: "left" | "center" | "right";
};

export type WrappedText = {
  lines: string[];
  width: number;
  height: number;
  fontSize: number;
};

export type LayoutTextBlock = {
  x: number;
  y: number;
  width: number;
  text: string;
  html?: string;
  style: LayoutTextStyle;
  wrapped: WrappedText;
};

export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
};

export type LayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NewsItemLayout = {
  id: string;
  top: number;
  height: number;
  title: LayoutTextBlock;
  imageRect: LayoutRect;
  meta: LayoutTextBlock;
  date: LayoutTextBlock;
  summary: LayoutTextBlock;
  linkRect: LayoutRect;
  divider: LayoutRect;
  linkText: LayoutTextBlock;
  link: string;
  imageName: string;
};

export type BulletinLayout = {
  width: number;
  height: number;
  whitePanel: LayoutRect;
  headerBadge: LayoutRect;
  headerLogo: LayoutBox;
  intro: LayoutTextBlock;
  footerLogo: LayoutBox | null;
  newsLayouts: NewsItemLayout[];
};

export type ExcelImportRow = {
  title: string;
  summary: string;
  source: string;
  author: string;
  date: string;
  link: string;
  image_name: string;
  intro_text?: string;
};

export type ImportSummary = {
  importedCount: number;
  matchedCount: number;
  missingImages: string[];
};
