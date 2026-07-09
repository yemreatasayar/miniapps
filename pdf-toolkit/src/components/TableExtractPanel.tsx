import type { ExtractedTableDocument, LoadedPdf } from "../lib/types";
import { getPdfLocale } from "../lib/i18n";

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
  const locale = getPdfLocale();
  const copy =
    locale === "en"
      ? {
          title: "Tables",
          description: "Extract table-like text into CSV or Excel.",
          allPages: `${loadedPdf.pages.length} pages`,
          selectedPages: `${selectedCount} selected pages`,
          analyze: "Analyze Table",
          analyzing: "Analyzing...",
          csv: "Download CSV",
          excel: "Download Excel",
          page: "Page",
          row: "Rows",
          maxColumn: "Max. columns",
          empty: "No clear text table was found in this PDF.",
        }
      : {
          title: "Tablolar",
          description: "Metin tabanlı tabloları CSV veya Excel olarak çıkarır.",
          allPages: `${loadedPdf.pages.length} sayfanın tamamı`,
          selectedPages: `${selectedCount} seçili sayfa`,
          analyze: "Tabloyu Analiz Et",
          analyzing: "Analiz ediliyor...",
          csv: "CSV İndir",
          excel: "Excel İndir",
          page: "Sayfa",
          row: "Satır",
          maxColumn: "Maks. sütun",
          empty: "Bu PDF içinde belirgin bir metin tablosu bulunamadı.",
        };

  return (
    <section className="table-extract-panel">
      <div className="panel-hero">
        <div className="table-extract-copy">
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>

        <div className="text-extract-preview-meta">
          <span className="meta-chip meta-chip-file" title={loadedPdf.fileName}>
            {loadedPdf.fileName}
          </span>
          <span className="meta-chip">
            {selectedCount > 0 ? copy.selectedPages : copy.allPages}
          </span>
          <span className="meta-chip">CSV / XLSX</span>
        </div>

        <div className="panel-action-row table-extract-actions">
          <button type="button" className="text-extract-button" onClick={onExtract} disabled={busy}>
            {busy ? copy.analyzing : copy.analyze}
          </button>
          <button type="button" onClick={onDownloadCsv} disabled={busy}>
            {copy.csv}
          </button>
          <button type="button" onClick={onDownloadExcel} disabled={busy}>
            {copy.excel}
          </button>
        </div>
      </div>

      {statusMessage ? <div className="text-extract-note">{statusMessage}</div> : null}

      {extractedTables ? (
        extractedTables.pages.length > 0 ? (
          <div className="table-extract-preview">
            <div className="text-extract-summary">
              <div className="text-extract-stat">
                <span>{copy.page}</span>
                <strong>{extractedTables.pages.length}</strong>
              </div>
              <div className="text-extract-stat">
                <span>{copy.row}</span>
                <strong>{extractedTables.rowCount}</strong>
              </div>
              <div className="text-extract-stat">
                <span>{copy.maxColumn}</span>
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
                  {copy.page} {page.pageNumber}
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
            {copy.empty}
          </div>
        )
      ) : null}
    </section>
  );
}
