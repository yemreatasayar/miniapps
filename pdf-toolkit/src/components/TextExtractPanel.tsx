import type { ExtractedTextDocument, LoadedPdf, TextExtractMode } from "../lib/types";

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

  return (
    <section className="text-extract-panel">
      <div className="panel-hero">
        <div className="text-extract-copy">
          <h2>Text Extractor</h2>
          <p>
            {isOcrMode
              ? "Taranmış PDF sayfalarını OCR ile okuyup düzenlenebilir DOCX çıktısına dönüştürür. İlk kullanımda dil modeli indirilebilir."
              : "PDF içindeki metin katmanını çıkarır, başlık, alt başlık ve paragraf olarak gruplar; ardından sade bir DOCX belgesi olarak kaydeder."}
          </p>
        </div>

        <div className="text-extract-preview-meta">
          <span className="meta-chip meta-chip-file" title={loadedPdf.fileName}>
            {loadedPdf.fileName}
          </span>
          <span className="meta-chip">
            {selectedCount > 0 ? `${selectedCount} seçili sayfa` : `${loadedPdf.pages.length} sayfanın tamamı`}
          </span>
          <span className="meta-chip">{isOcrMode ? "DOCX / OCR (TR + EN)" : "DOCX / Metin Katmanı"}</span>
        </div>

        <div className="panel-action-row">
          <div className="text-extract-toggle" role="tablist" aria-label="Metin çıkarma modu">
            <button
              type="button"
              className={mode === "text-layer" ? "is-active" : ""}
              onClick={() => onModeChange("text-layer")}
              disabled={busy}
            >
              Metin Katmanı
            </button>
            <button
              type="button"
              className={mode === "ocr" ? "is-active" : ""}
              onClick={() => onModeChange("ocr")}
              disabled={busy}
            >
              OCR
            </button>
          </div>

          <button
            type="button"
            className="text-extract-button"
            onClick={onGenerate}
            disabled={busy}
          >
            {busy ? "İşleniyor..." : isOcrMode ? "OCR ile DOCX Oluştur" : "DOCX Oluştur ve İndir"}
          </button>
        </div>
      </div>

      {statusMessage ? <div className="text-extract-note">{statusMessage}</div> : null}

      {extractedText ? (
        <div className="text-extract-preview">
          <div className="text-extract-summary">
            <div className="text-extract-stat">
              <span>Sayfa</span>
              <strong>{extractedText.pages.length}</strong>
            </div>
            <div className="text-extract-stat">
              <span>Blok</span>
              <strong>{extractedText.blockCount}</strong>
            </div>
            <div className="text-extract-stat">
              <span>Karakter</span>
              <strong>{extractedText.characterCount}</strong>
            </div>
          </div>

          <div className="text-extract-pages">
            {extractedText.pages.map((page) => (
              <article key={page.pageNumber} className="text-page-card">
                <div className="text-page-label">Sayfa {page.pageNumber}</div>
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
                    <p className="text-block text-block-empty">Bu sayfada çıkarılabilir metin bulunamadı.</p>
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
