import { useState } from "react";
import { getPdfLocale } from "../lib/i18n";
import type { PdfPage } from "../lib/types";
import PageThumbnail from "./PageThumbnail";

type PageGridProps = {
  pages: PdfPage[];
  selectedPages: Set<number>;
  onSelectionChange: (index: number, checked: boolean) => void;
  onReorder: (newOrder: number[]) => void;
  onRotate: (index: number, direction: "cw" | "ccw") => void;
};

export default function PageGrid({
  pages,
  selectedPages,
  onSelectionChange,
  onReorder,
  onRotate,
}: PageGridProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const locale = getPdfLocale();
  const copy =
    locale === "en"
      ? {
          select: "Select",
          page: "Page",
          rotateLeft: (pageNumber: number) => `Rotate page ${pageNumber} left`,
          rotateRight: (pageNumber: number) => `Rotate page ${pageNumber} right`,
          rotateLeftTitle: "Rotate left",
          rotateRightTitle: "Rotate right",
        }
      : {
          select: "Seç",
          page: "Sayfa",
          rotateLeft: (pageNumber: number) => `Sayfa ${pageNumber} sola döndür`,
          rotateRight: (pageNumber: number) => `Sayfa ${pageNumber} sağa döndür`,
          rotateLeftTitle: "Sola döndür",
          rotateRightTitle: "Sağa döndür",
        };

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }

    const reordered = [...pages];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    onReorder(reordered.map((page) => page.pageIndex));
    setDragIndex(null);
    setDropIndex(null);
  }

  return (
    <div className="page-grid">
      {pages.map((page, visibleIndex) => (
        <article
          key={`${page.pageIndex}-${visibleIndex}`}
          className={`page-card ${selectedPages.has(page.pageIndex) ? "is-selected" : ""} ${
            dropIndex === visibleIndex ? "is-drop-target" : ""
          }`}
          draggable
          onDragStart={() => setDragIndex(visibleIndex)}
          onDragEnd={() => {
            setDragIndex(null);
            setDropIndex(null);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDropIndex(visibleIndex);
          }}
          onDrop={() => handleDrop(visibleIndex)}
        >
          <div className="page-card-toolbar">
            <label className="page-checkbox">
              <input
                type="checkbox"
                checked={selectedPages.has(page.pageIndex)}
                onChange={(event) => onSelectionChange(page.pageIndex, event.target.checked)}
              />
              <span>{copy.select}</span>
            </label>
            <div className="page-rotate-actions">
              <button
                type="button"
                onClick={() => onRotate(page.pageIndex, "ccw")}
                aria-label={copy.rotateLeft(visibleIndex + 1)}
                title={copy.rotateLeftTitle}
              >
                ↺
              </button>
              <button
                type="button"
                onClick={() => onRotate(page.pageIndex, "cw")}
                aria-label={copy.rotateRight(visibleIndex + 1)}
                title={copy.rotateRightTitle}
              >
                ↻
              </button>
            </div>
          </div>

          <div className="page-card-preview">
            <PageThumbnail page={page} />
          </div>
          <div className="page-card-meta">
            <strong>{copy.page} {visibleIndex + 1}</strong>
            {page.rotation !== 0 ? <span>{page.rotation}°</span> : <span>0°</span>}
          </div>
        </article>
      ))}
    </div>
  );
}
