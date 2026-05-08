import type { ImageExportFormat, LoadedPdf, PdfPage } from "../lib/types";

type ToolbarProps = {
  loadedPdf: LoadedPdf | null;
  pages: PdfPage[];
  selectedPages: Set<number>;
  compressAvailable: boolean | null;
  onSplit: () => void;
  onMerge: () => void;
  onDeleteSelected: () => void;
  onApplyRotations: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onRepair: () => void;
  onLoadNew: () => void;
  imageExportFormat: ImageExportFormat;
  onImageExportFormatChange: (format: ImageExportFormat) => void;
  onExportImages: () => void;
  busy?: boolean;
};

export default function Toolbar({
  loadedPdf,
  pages,
  selectedPages,
  compressAvailable,
  onSplit,
  onMerge,
  onDeleteSelected,
  onApplyRotations,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onRepair,
  onLoadNew,
  imageExportFormat,
  onImageExportFormatChange,
  onExportImages,
  busy = false,
}: ToolbarProps) {
  const hasPdf = Boolean(loadedPdf);
  const hasSelection = selectedPages.size > 0;
  const hasRotations = pages.some((page) => page.rotation !== 0);

  return (
    <div className="toolbar">
      <div className="toolbar-main-group">
        <button type="button" className="toolbar-primary" onClick={onLoadNew} disabled={busy}>
          Yeni PDF Yükle
        </button>
        <button type="button" onClick={onSplit} disabled={!hasPdf || busy}>
          Böl
        </button>
        <button type="button" onClick={onMerge} disabled={!hasPdf || busy}>
          Birleştir
        </button>
        <button type="button" onClick={onDeleteSelected} disabled={!hasSelection || busy}>
          Sil
        </button>
        <button type="button" onClick={onApplyRotations} disabled={!hasRotations || busy}>
          Rotasyonu Uygula
        </button>
        <button type="button" onClick={onUndo} disabled={!canUndo || busy}>
          Geri Al
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo || busy}>
          İleri Al
        </button>
      </div>

      <div className="toolbar-side-group">
        <div className="toolbar-export-group">
          <select
            value={imageExportFormat}
            onChange={(event) => onImageExportFormatChange(event.target.value as ImageExportFormat)}
            disabled={!hasPdf || busy}
            aria-label="Dışa aktarma formatı"
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="pdf">PDF</option>
          </select>
          <button type="button" onClick={onExportImages} disabled={!hasPdf || busy}>
            Dışarı Aktar
          </button>
        </div>
        {compressAvailable === true ? (
          <button
            type="button"
            className="toolbar-repair"
            onClick={onRepair}
            disabled={!hasPdf || busy}
            title="Acrobat uyumluluğu için Ghostscript ile PDF yapısını onar"
          >
            Acrobat Onar
          </button>
        ) : null}
      </div>
    </div>
  );
}
