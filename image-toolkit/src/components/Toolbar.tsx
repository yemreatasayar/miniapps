import type { ResizeSettings } from "../lib/types";

type ToolbarProps = {
  hasImages: boolean;
  hasSelection: boolean;
  hasRotations: boolean;
  busy: boolean;
  onLoadMore: () => void;
  onDeleteSelected: () => void;
  onApplyRotations: () => void;
  onDownloadSelected: () => void;
  onDownloadAll: () => void;
  onDownloadZipSelected: () => void;
  onDownloadZipAll: () => void;
  resizeSettings: ResizeSettings;
  onResizeSettingsChange: (settings: ResizeSettings) => void;
};

export default function Toolbar({
  hasImages,
  hasSelection,
  hasRotations,
  busy,
  onLoadMore,
  onDeleteSelected,
  onApplyRotations,
  onDownloadSelected,
  onDownloadAll,
  onDownloadZipSelected,
  onDownloadZipAll,
  resizeSettings,
  onResizeSettingsChange,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <button type="button" className="toolbar-primary" onClick={onLoadMore} disabled={busy}>
        Görsel Ekle
      </button>
      <button type="button" onClick={onDeleteSelected} disabled={!hasSelection || busy}>
        Seçilileri Sil
      </button>
      <button type="button" onClick={onApplyRotations} disabled={!hasRotations || busy}>
        Rotasyonu Uygula
      </button>
      <button type="button" onClick={onDownloadSelected} disabled={!hasSelection || busy}>
        Seçilileri İndir
      </button>
      <button type="button" onClick={onDownloadZipSelected} disabled={!hasSelection || busy}>
        Seçilileri ZIP
      </button>
      <button type="button" onClick={onDownloadAll} disabled={!hasImages || busy}>
        Tümünü İndir
      </button>
      <button type="button" onClick={onDownloadZipAll} disabled={!hasImages || busy}>
        Tümünü ZIP
      </button>

      <div className="toolbar-resize-group">
        <select
          value={resizeSettings.mode}
          onChange={(event) =>
            onResizeSettingsChange({ ...resizeSettings, mode: event.target.value as ResizeSettings["mode"] })
          }
          disabled={busy}
          aria-label="Resize modu"
        >
          <option value="off">Boyut değiştirme yok</option>
          <option value="width">Genişliğe göre</option>
          <option value="fit">Kutuya sığdır</option>
        </select>

        {resizeSettings.mode !== "off" ? (
          <input
            type="number"
            min={1}
            value={resizeSettings.width}
            onChange={(event) =>
              onResizeSettingsChange({
                ...resizeSettings,
                width: Math.max(1, Number(event.target.value) || 1),
              })
            }
            disabled={busy}
            aria-label="Genişlik"
          />
        ) : null}

        {resizeSettings.mode === "fit" ? (
          <input
            type="number"
            min={1}
            value={resizeSettings.height}
            onChange={(event) =>
              onResizeSettingsChange({
                ...resizeSettings,
                height: Math.max(1, Number(event.target.value) || 1),
              })
            }
            disabled={busy}
            aria-label="Yükseklik"
          />
        ) : null}
      </div>
    </div>
  );
}
