import { useEffect, useState } from "react";
import { renderWatermarkPreviewPages } from "../lib/pdf-ops";
import type { PdfPage, WatermarkSettings } from "../lib/types";

type WatermarkPreviewProps = {
  fileBytes: Uint8Array | null;
  pages: PdfPage[];
  settings: WatermarkSettings;
  selectedPages: Set<number>;
};

export default function WatermarkPreview({
  fileBytes,
  pages,
  settings,
  selectedPages,
}: WatermarkPreviewProps) {
  const [previewThumbs, setPreviewThumbs] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      if (!fileBytes || pages.length === 0) {
        setPreviewThumbs([]);
        return;
      }

      const hasRenderableWatermark =
        settings.type === "text" ? settings.text.trim().length > 0 : settings.imageDataUrl !== null;

      if (!hasRenderableWatermark) {
        setPreviewThumbs([]);
        return;
      }

      const targetPageIndices =
        settings.target === "selected" && selectedPages.size > 0
          ? [...selectedPages].sort((a, b) => a - b)
          : pages.map((page) => page.pageIndex);

      try {
        const thumbs = await renderWatermarkPreviewPages(
          fileBytes,
          settings,
          targetPageIndices,
          pages.map((page) => page.pageIndex),
        );

        if (!cancelled) {
          setPreviewThumbs(thumbs);
        }
      } catch {
        if (!cancelled) {
          setPreviewThumbs([]);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [fileBytes, pages, selectedPages, settings]);

  if (pages.length === 0) {
    return (
      <div className="watermark-preview-pane">
        <p className="watermark-preview-empty">PDF yüklenince önizleme burada görünür.</p>
      </div>
    );
  }

  return (
    <div className="watermark-preview-pane">
      <p className="watermark-preview-label">Önizleme</p>
      <div className="watermark-preview-grid">
        {pages.map((page, i) => (
          <div key={page.pageIndex} className="watermark-preview-card">
            <img
              src={previewThumbs[i] ?? page.thumbnail}
              alt={`Watermark önizleme sayfa ${i + 1}`}
              className="watermark-preview-canvas"
            />
            <span className="watermark-preview-page-num">Sayfa {i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
