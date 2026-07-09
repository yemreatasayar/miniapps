import type { ExtractedTextDocument, LoadedPdf, TextExtractMode } from "../lib/types";
import { getPdfLocale } from "../lib/i18n";

type TextExtractPanelProps = {
  loadedPdf: LoadedPdf;
  selectedCount: number;
  extractedText: ExtractedTextDocument | null;
  mode: TextExtractMode;
  statusMessage?: string | null;
  onModeChange: (mode: TextExtractMode) => void;
  onGenerate: () => void;
  busy?: boolean;
};

export default function TextExtractPanel({
  loadedPdf,
  selectedCount,
  extractedText,
  mode,
  statusMessage = null,
  onModeChange,
  onGenerate,
  busy = false,
}: TextExtractPanelProps) {
  const isOcrMode = mode === "ocr";
  const locale = getPdfLocale();
  const copy =
    locale === "en"
      ? {
          title: "Text",
          textLayerDesc: "Extract the PDF text layer and save it as DOCX.",
          ocrDesc: "Read scanned pages with OCR and save them as DOCX.",
          textLayer: "Text Layer",
          ocr: "OCR",
          buttonText: "Create DOCX",
          buttonOcr: "Create with OCR",
          processing: "Processing...",
          allPages: `${loadedPdf.pages.length} pages`,
          selectedPages: `${selectedCount} selected pages`,
          modeText: "DOCX / Text Layer",
          modeOcr: "DOCX / OCR (TR + EN)",
          page: "Page",
          block: "Block",
          character: "Character",
          empty: "No extractable text found on this page.",
        }
      : {
          title: "Metin",
          textLayerDesc: "PDF metin katmanını çıkarıp DOCX olarak kaydeder.",
          ocrDesc: "Taranmış sayfaları OCR ile okuyup DOCX olarak kaydeder.",
          textLayer: "Metin Katmanı",
          ocr: "OCR",
          buttonText: "DOCX Oluştur",
          buttonOcr: "OCR ile Oluştur",
          processing: "İşleniyor...",
          allPages: `${loadedPdf.pages.length} sayfanın tamamı`,
          selectedPages: `${selectedCount} seçili sayfa`,
          modeText: "DOCX / Metin Katmanı",
          modeOcr: "DOCX / OCR (TR + EN)",
          page: "Sayfa",
          block: "Blok",
          character: "Karakter",
          empty: "Bu sayfada çıkarılabilir metin bulunamadı.",
        };

  return (
    <section className="text-extract-panel">
      <div className="panel-hero">
        <div className="text-extract-copy">
          <h2>{copy.title}</h2>
          <p>
            {isOcrMode
              ? copy.ocrDesc
              : copy.textLayerDesc}
          </p>
        </div>

        <div className="text-extract-preview-meta">
          <span className="meta-chip meta-chip-file" title={loadedPdf.fileName}>
            {loadedPdf.fileName}
          </span>
          <span className="meta-chip">
            {selectedCount > 0 ? copy.selectedPages : copy.allPages}
          </span>
          <span className="meta-chip">{isOcrMode ? copy.modeOcr : copy.modeText}</span>
        </div>

        <div className="panel-action-row">
          <div className="text-extract-toggle" role="tablist" aria-label="Metin çıkarma modu">
            <button
              type="button"
              className={mode === "text-layer" ? "is-active" : ""}
              onClick={() => onModeChange("text-layer")}
              disabled={busy}
            >
              {copy.textLayer}
            </button>
            <button
              type="button"
              className={mode === "ocr" ? "is-active" : ""}
              onClick={() => onModeChange("ocr")}
              disabled={busy}
            >
              {copy.ocr}
            </button>
          </div>

          <button
            type="button"
            className="text-extract-button"
            onClick={onGenerate}
            disabled={busy}
          >
            {busy ? copy.processing : isOcrMode ? copy.buttonOcr : copy.buttonText}
          </button>
        </div>
      </div>

      {statusMessage ? <div className="text-extract-note">{statusMessage}</div> : null}

      {extractedText ? (
        <div className="text-extract-preview">
          <div className="text-extract-summary">
            <div className="text-extract-stat">
              <span>{copy.page}</span>
              <strong>{extractedText.pages.length}</strong>
            </div>
            <div className="text-extract-stat">
              <span>{copy.block}</span>
              <strong>{extractedText.blockCount}</strong>
            </div>
            <div className="text-extract-stat">
              <span>{copy.character}</span>
              <strong>{extractedText.characterCount}</strong>
            </div>
          </div>

          <div className="text-extract-pages">
            {extractedText.pages.map((page) => (
              <article key={page.pageNumber} className="text-page-card">
                <div className="text-page-label">{copy.page} {page.pageNumber}</div>
                <div className="text-page-blocks">
                  {page.blocks.length > 0 ? (
                    page.blocks.map((block, index) => (
                      <p
                        key={`${page.pageNumber}-${index}`}
                        className={`text-block text-block-${block.kind}`}
                      >
                        {block.text}
                      </p>
                    ))
                  ) : (
                    <p className="text-block text-block-empty">{copy.empty}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
