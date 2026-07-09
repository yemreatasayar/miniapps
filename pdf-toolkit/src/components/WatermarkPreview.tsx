import { useEffect, useState } from "react";
import { renderWatermarkPreviewPages } from "../lib/pdf-ops";
import type { PdfPage, WatermarkSettings } from "../lib/types";
import { getPdfLocale } from "../lib/i18n";

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
  const [previewThumbsByPage, setPreviewThumbsByPage] = useState<Record<number, string>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const locale = getPdfLocale();
  const copy =
    locale === "en"
      ? {
          error: "Preview could not be prepared. You can still apply the watermark.",
          empty: "Preview appears after a PDF is loaded.",
          label: "Preview",
          alt: (page: number) => `Watermark preview page ${page}`,
          page: "Page",
        }
      : {
          error: "Önizleme hazırlanamadı. Filigran yine de uygulanabilir.",
          empty: "PDF yüklenince önizleme burada görünür.",
          label: "Önizleme",
          alt: (page: number) => `Filigran önizleme sayfa ${page}`,
          page: "Sayfa",
        };

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      if (!fileBytes || pages.length === 0) {
        setPreviewThumbsByPage({});
        setPreviewError(null);
        return;
      }

      const hasRenderableWatermark =
        settings.type === "text" ? settings.text.trim().length > 0 : settings.imageDataUrl !== null;

      if (!hasRenderableWatermark) {
        setPreviewThumbsByPage({});
        setPreviewError(null);
        return;
      }

      const targetPageIndices =
        settings.target === "selected" && selectedPages.size > 0
          ? [...selectedPages].sort((a, b) => a - b)
          : pages.map((page) => page.pageIndex);

      try {
        const previewPageIndices = pages.map((page) => page.pageIndex);
        const thumbs = await renderWatermarkPreviewPages(
          fileBytes,
          settings,
          targetPageIndices,
          previewPageIndices,
        );

        if (!cancelled) {
          setPreviewThumbsByPage(
            Object.fromEntries(previewPageIndices.map((pageIndex, index) => [pageIndex, thumbs[index]]))
          );
          setPreviewError(null);
        }
      } catch {
        if (!cancelled) {
          setPreviewThumbsByPage({});
          setPreviewError(copy.error);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [copy.error, fileBytes, pages, selectedPages, settings]);

  if (pages.length === 0) {
    return (
      <div className="watermark-preview-pane">
        <p className="watermark-preview-empty">{copy.empty}</p>
      </div>
    );
  }

  return (
    <div className="watermark-preview-pane">
      <p className="watermark-preview-label">{copy.label}</p>
      {previewError ? <p className="watermark-preview-error">{previewError}</p> : null}
      <div className="watermark-preview-grid">
        {pages.map((page, i) => (
          <div key={page.pageIndex} className="watermark-preview-card">
            <img
              src={previewThumbsByPage[page.pageIndex] ?? page.thumbnail}
              alt={copy.alt(i + 1)}
              className="watermark-preview-canvas"
            />
            <span className="watermark-preview-page-num">{copy.page} {i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
