import type { ImageExportFormat, LoadedPdf, PdfPage } from "../lib/types";

type ToolbarProps = {
  loadedPdf: LoadedPdf | null;
  pages: PdfPage[];
  selectedPages: Set<number>;
  compressAvailable: boolean | null;
  onSplit: () => void;
  onMerge: () => void;
  onExtract: () => void;
  onDeleteSelected: () => void;
  onApplyRotations: () => void;
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
  onExtract,
  onDeleteSelected,
  onApplyRotations,
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
          Split
        </button>
        <button type="button" onClick={onMerge} disabled={!hasPdf || busy}>
          Merge
        </button>
        <button type="button" onClick={onExtract} disabled={!hasSelection || busy}>
          Extract
        </button>
        <button type="button" onClick={onDeleteSelected} disabled={!hasSelection || busy}>
          Sil
        </button>
        <button type="button" onClick={onApplyRotations} disabled={!hasRotations || busy}>
          Rotasyonu Uygula
        </button>
      </div>

      <div className="toolbar-side-group">
        <div className="toolbar-export-group">
          <select
            value={imageExportFormat}
            onChange={(event) => onImageExportFormatChange(event.target.value as ImageExportFormat)}
            disabled={!hasPdf || busy}
            aria-label="Görsel formatı"
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
          <button type="button" onClick={onExportImages} disabled={!hasPdf || busy}>
            Farklı Kaydet
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
            Acrobat Repair
          </button>
        ) : null}
      </div>
    </div>
  );
}
