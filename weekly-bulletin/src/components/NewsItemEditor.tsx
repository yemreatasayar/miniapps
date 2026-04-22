import { ChangeEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { summaryHtmlToText, summaryTextToHtml } from "../lib/format";
import { NewsItem } from "../lib/types";

type NewsItemEditorProps = {
  item: NewsItem;
  isCollapsed: boolean;
  dragEnabled: boolean;
  onChange: (itemId: string, field: keyof Omit<NewsItem, "id">, value: string | number | boolean) => void;
  onDelete: (itemId: string) => void;
  onToggleCollapse: (itemId: string) => void;
  onImageUpload: (itemId: string, file: File) => void;
  onClearImage: (itemId: string) => void;
  onDragStart: (itemId: string) => void;
  onDropOn: (itemId: string, position: "before" | "after") => void;
};

function createDragPreview(source: HTMLElement): { node: HTMLElement; offsetX: number; offsetY: number } {
  const rect = source.getBoundingClientRect();
  const preview = source.cloneNode(true) as HTMLElement;
  preview.style.position = "fixed";
  preview.style.top = "-9999px";
  preview.style.left = "-9999px";
  preview.style.width = `${rect.width}px`;
  preview.style.maxWidth = `${rect.width}px`;
  preview.style.pointerEvents = "none";
  preview.style.transform = "none";
  preview.style.boxShadow = "0 16px 36px rgba(0, 0, 0, 0.16)";
  preview.style.opacity = "0.96";
  preview.classList.add("editor-card-drag-preview");
  document.body.appendChild(preview);

  return {
    node: preview,
    offsetX: Math.max(16, Math.min(rect.width - 16, rect.width / 2)),
    offsetY: Math.max(16, Math.min(rect.height - 16, 28)),
  };
}

function handleInputFile(
  event: ChangeEvent<HTMLInputElement>,
  itemId: string,
  onImageUpload: (itemId: string, file: File) => void
): void {
  const file = event.target.files?.[0];
  if (!file) return;
  onImageUpload(itemId, file);
  event.target.value = "";
}

function FormatIcon({ type }: { type: "bold" | "italic" | "left" | "center" | "right" }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (type === "bold") {
    return (
      <svg {...common}>
        <path d="M4 2.5h4.5a2.75 2.75 0 0 1 0 5.5H4z" />
        <path d="M4 8h5.3a2.75 2.75 0 1 1 0 5.5H4z" />
      </svg>
    );
  }

  if (type === "italic") {
    return (
      <svg {...common}>
        <path d="M9.5 2.5h3" />
        <path d="M3.5 13.5h3" />
        <path d="M9.5 2.5l-3 11" />
      </svg>
    );
  }

  if (type === "center") {
    return (
      <svg {...common}>
        <path d="M3 4h10" />
        <path d="M5 7h6" />
        <path d="M4 10h8" />
        <path d="M6 13h4" />
      </svg>
    );
  }

  if (type === "right") {
    return (
      <svg {...common}>
        <path d="M3 4h10" />
        <path d="M6 7h7" />
        <path d="M4 10h9" />
        <path d="M8 13h5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M3 4h10" />
      <path d="M3 7h7" />
      <path d="M3 10h9" />
      <path d="M3 13h5" />
    </svg>
  );
}

export default function NewsItemEditor({
  item,
  isCollapsed,
  dragEnabled,
  onChange,
  onDelete,
  onToggleCollapse,
  onImageUpload,
  onClearImage,
  onDragStart,
  onDropOn,
}: NewsItemEditorProps) {
  const [isLinkLabelEditing, setIsLinkLabelEditing] = useState(false);
  const [linkLabelDraft, setLinkLabelDraft] = useState(item.linkLabel || "Tamamını okumak için tıklayın.");
  const [summaryHtmlDraft, setSummaryHtmlDraft] = useState(item.summaryHtml || summaryTextToHtml(item.summary));
  const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const summaryEditorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  useEffect(() => {
    setLinkLabelDraft(item.linkLabel || "Tamamını okumak için tıklayın.");
  }, [item.linkLabel, item.id]);

  useEffect(() => {
    setSummaryHtmlDraft(item.summaryHtml || summaryTextToHtml(item.summary));
  }, [item.id, item.summaryHtml, item.summary]);

  useEffect(() => {
    const editor = summaryEditorRef.current;
    if (!editor) return;
    if (editor.innerHTML === summaryHtmlDraft) return;
    editor.innerHTML = summaryHtmlDraft;
  }, [summaryHtmlDraft, isCollapsed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onChange(item.id, "summaryHtml", summaryHtmlDraft);
      onChange(item.id, "summary", summaryHtmlToText(summaryHtmlDraft));
    }, 180);

    return () => window.clearTimeout(timer);
  }, [item.id, onChange, summaryHtmlDraft]);

  function saveLinkLabel(): void {
    onChange(item.id, "linkLabel", linkLabelDraft);
    setIsLinkLabelEditing(false);
  }

  function cancelLinkLabel(): void {
    setLinkLabelDraft(item.linkLabel || "Tamamını okumak için tıklayın.");
    setIsLinkLabelEditing(false);
  }

  function saveSelection(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection(): void {
    const selection = window.getSelection();
    if (!selection || !savedRangeRef.current) return;
    selection.removeAllRanges();
    selection.addRange(savedRangeRef.current);
  }

  function syncSummaryFromEditor(): void {
    const editor = summaryEditorRef.current;
    if (!editor) return;
    const html = editor.innerHTML || "<p></p>";
    setSummaryHtmlDraft(html);
    saveSelection();
  }

  function applyExecCommand(command: string, value?: string): void {
    const editor = summaryEditorRef.current;
    if (!editor) return;
    editor.focus();
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    syncSummaryFromEditor();
  }

  function handleSummaryKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    const command = event.shiftKey ? "insertLineBreak" : "insertParagraph";
    applyExecCommand(command);
  }

  return (
    <article
      className={`editor-card ${isCollapsed ? "editor-card-collapsed" : ""} ${dragEnabled ? "editor-card-draggable" : ""} ${
        isDragging ? "editor-card-dragging" : ""
      } ${dropPosition ? `editor-card-drop-${dropPosition}` : ""}`}
      draggable={dragEnabled}
      onDragStart={(event) => {
        if (!dragEnabled) return;
        const el = event.currentTarget as HTMLElement;
        const { node, offsetX, offsetY } = createDragPreview(el);
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.setDragImage(node, offsetX, offsetY);
        event.dataTransfer.effectAllowed = "move";
        setIsDragging(true);
        onDragStart(item.id);
        window.setTimeout(() => node.remove(), 0);
      }}
      onDragEnd={() => {
        setIsDragging(false);
        setDropPosition(null);
      }}
      onDragOver={(event) => {
        if (!dragEnabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        const nextPosition = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
        if (dropPosition !== nextPosition) {
          setDropPosition(nextPosition);
        }
      }}
      onDragLeave={(event) => {
        if (!dragEnabled) return;
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        setDropPosition(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (!dragEnabled) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const nextPosition = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
        setIsDragging(false);
        setDropPosition(null);
        onDropOn(item.id, nextPosition);
      }}
    >
      <div className="editor-card-header">
        <button type="button" className="editor-card-toggle" onClick={() => onToggleCollapse(item.id)}>
          <span className="editor-card-toggle-indicator">{isCollapsed ? "+" : "-"}</span>
          <div>
            <span className="editor-card-kicker">Haber</span>
            <strong>{item.title.trim() || "Yeni haber"}</strong>
          </div>
        </button>
        <button type="button" className="ghost-button danger" onClick={() => onDelete(item.id)}>
          Sil
        </button>
      </div>

      {isCollapsed ? null : (
        <>
          <label className="field">
            <span>Başlık</span>
            <textarea
              value={item.title}
              onChange={(event) => onChange(item.id, "title", event.target.value)}
              rows={3}
            />
          </label>

          <div className="editor-block">
            <span className="field-label">Özet</span>
            <div className="summary-toolbar">
              <label className="summary-toolbar-size">
                <select
                  value={item.summaryFontSize}
                  onChange={(event) => onChange(item.id, "summaryFontSize", Number(event.target.value))}
                >
                  {[20, 22, 24, 25, 26, 28, 30, 32].map((size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  ))}
                </select>
              </label>

              <div className="summary-toolbar-group">
                <button
                  type="button"
                  className="summary-toolbar-button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyExecCommand("bold")}
                  aria-label="Kalın"
                >
                  <FormatIcon type="bold" />
                </button>
                <button
                  type="button"
                  className="summary-toolbar-button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyExecCommand("italic")}
                  aria-label="İtalik"
                >
                  <FormatIcon type="italic" />
                </button>
              </div>

              <div className="summary-toolbar-group">
                {(["left", "center", "right"] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    className="summary-toolbar-button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      applyExecCommand(
                        align === "left" ? "justifyLeft" : align === "center" ? "justifyCenter" : "justifyRight"
                      )
                    }
                    aria-label={`Hizalama ${align}`}
                  >
                    <FormatIcon type={align} />
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={summaryEditorRef}
              className="rich-summary-editor"
              contentEditable
              suppressContentEditableWarning
              onKeyDown={handleSummaryKeyDown}
              onInput={syncSummaryFromEditor}
              onBlur={syncSummaryFromEditor}
              onKeyUp={saveSelection}
              onMouseUp={saveSelection}
            />
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Kaynak</span>
              <input value={item.source} onChange={(event) => onChange(item.id, "source", event.target.value)} />
            </label>
            <label className="field">
              <span>Yazar</span>
              <input value={item.author} onChange={(event) => onChange(item.id, "author", event.target.value)} />
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Tarih</span>
              <input value={item.date} onChange={(event) => onChange(item.id, "date", event.target.value)} />
            </label>
            <label className="field">
              <span>Link</span>
              <input value={item.link} onChange={(event) => onChange(item.id, "link", event.target.value)} />
            </label>
          </div>

          <div className="editor-block">
            <span className="field-label">Buton Metni</span>
            {isLinkLabelEditing ? (
              <>
                <label className="field">
                  <input value={linkLabelDraft} onChange={(event) => setLinkLabelDraft(event.target.value)} />
                </label>
                <div className="editor-inline-buttons">
                  <button type="button" className="secondary-button" onClick={saveLinkLabel}>
                    Kaydet
                  </button>
                  <button type="button" className="secondary-button secondary-button-muted" onClick={cancelLinkLabel}>
                    İptal
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="readonly-box">{item.linkLabel || "Tamamını okumak için tıklayın."}</div>
                <div className="editor-inline-buttons">
                  <button type="button" className="secondary-button" onClick={() => setIsLinkLabelEditing(true)}>
                    Buton yazısını düzenle
                  </button>
                </div>
              </>
            )}
          </div>

          <label className="field">
            <span>Görsel</span>
            <input
              value={item.imageName}
              onChange={(event) => onChange(item.id, "imageName", event.target.value)}
              placeholder="örnek-görsel.jpg"
            />
          </label>

          <div className="image-row">
            <div className="inline-actions">
              <label className="ghost-button">
                Görsel seç
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleInputFile(event, item.id, onImageUpload)}
                />
              </label>
              <button type="button" className="ghost-button" onClick={() => onClearImage(item.id)}>
                Görseli temizle
              </button>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
