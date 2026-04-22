import { useState } from "react";
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
              <span>Seç</span>
            </label>
            <div className="page-rotate-actions">
              <button type="button" onClick={() => onRotate(page.pageIndex, "ccw")}>
                ↺
              </button>
              <button type="button" onClick={() => onRotate(page.pageIndex, "cw")}>
                ↻
              </button>
            </div>
          </div>

          <div className="page-card-preview">
            <PageThumbnail page={page} />
          </div>
          <div className="page-card-meta">
            <strong>Sayfa {visibleIndex + 1}</strong>
            {page.rotation !== 0 ? <span>{page.rotation}°</span> : <span>0°</span>}
          </div>
        </article>
      ))}
    </div>
  );
}
