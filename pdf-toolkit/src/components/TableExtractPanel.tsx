import type { ExtractedTableDocument, LoadedPdf } from "../lib/types";

type TableExtractPanelProps = {
  loadedPdf: LoadedPdf;
  selectedCount: number;
  extractedTables: ExtractedTableDocument | null;
  previewPageNumber: number | null;
  statusMessage?: string | null;
  busy?: boolean;
  onExtract: () => void;
  onDownloadCsv: () => void;
  onDownloadExcel: () => void;
  onPreviewPageChange: (pageNumber: number) => void;
};

export default function TableExtractPanel({
  loadedPdf,
  selectedCount,
  extractedTables,
  previewPageNumber,
  statusMessage = null,
  busy = false,
  onExtract,
  onDownloadCsv,
  onDownloadExcel,
  onPreviewPageChange,
}: TableExtractPanelProps) {
  const previewPage =
    extractedTables?.pages.find((page) => page.pageNumber === previewPageNumber) ?? extractedTables?.pages[0] ?? null;

  return (
    <section className="table-extract-panel">
      <div className="panel-hero">
        <div className="table-extract-copy">
          <h2>Table Extractor</h2>
          <p>
            Dijital PDF içindeki satır ve sütun düzenini okuyup tabloyu CSV veya Excel olarak dışa aktarır.
            Taranmış PDF&apos;lerde sonuçlar sınırlı olabilir; bu ilk sürüm metin katmanına dayanır.
          </p>
        </div>

        <div className="text-extract-preview-meta">
          <span className="meta-chip meta-chip-file" title={loadedPdf.fileName}>
            {loadedPdf.fileName}
          </span>
          <span className="meta-chip">
            {selectedCount > 0 ? `${selectedCount} seçili sayfa` : `${loadedPdf.pages.length} sayfanın tamamı`}
          </span>
          <span className="meta-chip">CSV / XLSX</span>
        </div>

        <div className="panel-action-row table-extract-actions">
          <button type="button" className="text-extract-button" onClick={onExtract} disabled={busy}>
            {busy ? "Analiz ediliyor..." : "Tabloyu Analiz Et"}
          </button>
          <button type="button" onClick={onDownloadCsv} disabled={busy}>
            CSV İndir
          </button>
          <button type="button" onClick={onDownloadExcel} disabled={busy}>
            Excel İndir
          </button>
        </div>
      </div>

      {statusMessage ? <div className="text-extract-note">{statusMessage}</div> : null}

      {extractedTables ? (
        extractedTables.pages.length > 0 ? (
          <div className="table-extract-preview">
            <div className="text-extract-summary">
              <div className="text-extract-stat">
                <span>Sayfa</span>
                <strong>{extractedTables.pages.length}</strong>
              </div>
              <div className="text-extract-stat">
                <span>Satır</span>
                <strong>{extractedTables.rowCount}</strong>
              </div>
              <div className="text-extract-stat">
                <span>Maks. Sütun</span>
                <strong>{extractedTables.maxColumnCount}</strong>
              </div>
            </div>

            <div className="table-page-chips">
              {extractedTables.pages.map((page) => (
                <button
                  key={page.pageNumber}
                  type="button"
                  className={previewPage?.pageNumber === page.pageNumber ? "is-active" : ""}
                  onClick={() => onPreviewPageChange(page.pageNumber)}
                >
                  Sayfa {page.pageNumber}
                </button>
              ))}
            </div>

            {previewPage ? (
              <div className="table-preview-card">
                <div className="table-shell">
                  <table className="preview-table">
                    <tbody>
                      {previewPage.rows.map((row, rowIndex) => (
                        <tr key={`${previewPage.pageNumber}-${rowIndex}`}>
                          {row.map((cell, cellIndex) => (
                            <td key={`${previewPage.pageNumber}-${rowIndex}-${cellIndex}`} title={cell}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-extract-empty">
            Bu PDF içinde tabloya dönüştürülebilecek belirgin bir metin ızgarası bulunamadı.
          </div>
        )
      ) : null}
    </section>
  );
}
