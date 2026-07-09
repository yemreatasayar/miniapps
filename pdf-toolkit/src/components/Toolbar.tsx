import type { ImageExportFormat, LoadedPdf, PdfPage } from "../lib/types";
import { pdfCopy, type PdfLocale } from "../lib/i18n";

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
  locale: PdfLocale;
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
  locale,
}: ToolbarProps) {
  const hasPdf = Boolean(loadedPdf);
  const hasSelection = selectedPages.size > 0;
  const hasRotations = pages.some((page) => page.rotation !== 0);
  const copy = pdfCopy[locale].toolbar;

  return (
    <div className="toolbar">
      <div className="toolbar-main-group">
        <button type="button" className="toolbar-primary" onClick={onLoadNew} disabled={busy}>
          {copy.loadNew}
        </button>
        <button type="button" onClick={onSplit} disabled={!hasPdf || busy}>
          {copy.split}
        </button>
        <button type="button" onClick={onMerge} disabled={!hasPdf || busy}>
          {copy.merge}
        </button>
        <button type="button" onClick={onDeleteSelected} disabled={!hasSelection || busy}>
          {copy.delete}
        </button>
        <button type="button" onClick={onApplyRotations} disabled={!hasRotations || busy}>
          {copy.applyRotations}
        </button>
        <button type="button" onClick={onUndo} disabled={!canUndo || busy}>
          {copy.undo}
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo || busy}>
          {copy.redo}
        </button>
      </div>

      <div className="toolbar-side-group">
        <div className="toolbar-export-group">
          <select
            value={imageExportFormat}
            onChange={(event) => onImageExportFormatChange(event.target.value as ImageExportFormat)}
            disabled={!hasPdf || busy}
            aria-label={copy.exportFormatLabel}
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="pdf">PDF</option>
          </select>
          <button type="button" onClick={onExportImages} disabled={!hasPdf || busy}>
            {copy.export}
          </button>
        </div>
        {compressAvailable === true ? (
          <button
            type="button"
            className="toolbar-repair"
            onClick={onRepair}
            disabled={!hasPdf || busy}
            title={copy.repairTitle}
          >
            {copy.repair}
          </button>
        ) : null}
      </div>
    </div>
  );
}
