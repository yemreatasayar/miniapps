import { useEffect, useMemo, useRef, useState } from "react";
import { resolveImage } from "../lib/format";
import { BulletinDocument, BulletinLayout, LayoutTextBlock } from "../lib/types";

type PreviewDocumentProps = {
  document: BulletinDocument;
  layout: BulletinLayout;
};

function PreviewText({ block, className }: { block: LayoutTextBlock; className?: string }) {
  return (
    <div
      className={className}
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        fontFamily: `"${block.style.fontFamily}", sans-serif`,
        fontSize: block.style.fontSize,
        fontWeight: block.style.fontWeight,
        fontStyle: block.style.fontStyle ?? "normal",
        lineHeight: `${block.style.lineHeight}px`,
        letterSpacing: block.style.letterSpacing ?? 0,
        color: block.style.color,
        textAlign: block.style.textAlign ?? "left",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
      }}
    >
      {block.text}
    </div>
  );
}

function PreviewRichText({ block, className }: { block: LayoutTextBlock; className?: string }) {
  return (
    <div
      className={className}
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        fontFamily: `"${block.style.fontFamily}", sans-serif`,
        fontSize: block.style.fontSize,
        fontWeight: block.style.fontWeight,
        fontStyle: block.style.fontStyle ?? "normal",
        lineHeight: `${block.style.lineHeight}px`,
        letterSpacing: block.style.letterSpacing ?? 0,
        color: block.style.color,
        textAlign: block.style.textAlign ?? "left",
        whiteSpace: "normal",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
      }}
      dangerouslySetInnerHTML={{ __html: block.html || "" }}
    />
  );
}

export default function PreviewDocument({ document, layout }: PreviewDocumentProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const fittedWidth = Math.max(220, entry.contentRect.width - 8);
      const nextScale = Math.min(0.84, Math.max(0.2, fittedWidth / layout.width));
      setScale(nextScale);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [layout.width]);

  const stageHeight = useMemo(() => layout.height * scale, [layout.height, scale]);
  const stageWidth = useMemo(() => layout.width * scale, [layout.width, scale]);

  return (
    <div className="preview-shell" ref={shellRef}>
      <div className="preview-viewport" style={{ minHeight: stageHeight + 24 }}>
        <div className="preview-stage" style={{ height: stageHeight, width: stageWidth }}>
          <div
            className="preview-document"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <div className="preview-bg" />
            <div
              className="preview-white-panel"
              style={{
                left: layout.whitePanel.x,
                top: layout.whitePanel.y,
                width: layout.whitePanel.width,
                height: layout.whitePanel.height,
                borderRadius: layout.whitePanel.radius,
              }}
            />
            <div
              className="preview-header-badge"
              style={{
                left: layout.headerBadge.x,
                top: layout.headerBadge.y,
                width: layout.headerBadge.width,
                height: layout.headerBadge.height,
                borderRadius: layout.headerBadge.radius,
              }}
            />

            <img
              className="preview-header-logo"
              src="/assets/header-logo.svg"
              alt="Filtre logosu"
              style={{
                left: layout.headerLogo.x,
                top: layout.headerLogo.y,
                width: layout.headerLogo.width,
                height: layout.headerLogo.height,
              }}
            />
            <PreviewText block={layout.intro} className="preview-text preview-intro" />

            {layout.newsLayouts.map((itemLayout) => {
              const image = resolveImage(document, itemLayout.imageName);

              return (
                <div key={itemLayout.id}>
                  <PreviewText block={itemLayout.title} className="preview-text" />

                  {image ? (
                    <img
                      className="preview-image"
                      src={image.dataUrl}
                      alt={itemLayout.title.text}
                      style={{
                        left: itemLayout.imageRect.x,
                        top: itemLayout.imageRect.y,
                        width: itemLayout.imageRect.width,
                        height: itemLayout.imageRect.height,
                        borderRadius: itemLayout.imageRect.radius ?? 0,
                      }}
                    />
                  ) : (
                    <div
                      className="preview-image preview-placeholder"
                      style={{
                        left: itemLayout.imageRect.x,
                        top: itemLayout.imageRect.y,
                        width: itemLayout.imageRect.width,
                        height: itemLayout.imageRect.height,
                        borderRadius: itemLayout.imageRect.radius ?? 0,
                      }}
                    >
                      Görsel yok
                    </div>
                  )}

                  <PreviewText block={itemLayout.meta} className="preview-text preview-meta" />
                  <PreviewText block={itemLayout.date} className="preview-text preview-date" />
                  <PreviewRichText block={itemLayout.summary} className="preview-text preview-rich-text" />
                  <a
                    className="preview-link-chip"
                    href={itemLayout.link || undefined}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      left: itemLayout.linkRect.x,
                      top: itemLayout.linkRect.y,
                      width: itemLayout.linkRect.width,
                      height: itemLayout.linkRect.height,
                      borderRadius: itemLayout.linkRect.radius ?? 18,
                      fontFamily: `"${itemLayout.linkText.style.fontFamily}", sans-serif`,
                      fontSize: itemLayout.linkText.style.fontSize,
                      fontWeight: itemLayout.linkText.style.fontWeight,
                      fontStyle: itemLayout.linkText.style.fontStyle ?? "normal",
                      lineHeight: `${itemLayout.linkText.style.lineHeight}px`,
                      letterSpacing: itemLayout.linkText.style.letterSpacing ?? 0,
                    }}
                  >
                    {itemLayout.linkText.text}
                  </a>
                  <div
                    className="preview-divider"
                    style={{
                      left: itemLayout.divider.x,
                      top: itemLayout.divider.y,
                      width: itemLayout.divider.width,
                      height: itemLayout.divider.height,
                    }}
                  />
                </div>
              );
            })}

            {layout.footerLogo ? (
              <img
                className="preview-footer-logo"
                src="/assets/footer-logo.svg"
                alt="Alt logo"
                style={{
                  left: layout.footerLogo.x,
                  top: layout.footerLogo.y,
                  width: layout.footerLogo.width,
                  height: layout.footerLogo.height,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
