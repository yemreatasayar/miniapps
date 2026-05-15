import { useRef, useState } from "react";
import { useLang } from "../lib/LangContext";

type DropZoneProps = {
  onFileSelected: (file: File) => void;
  loading: boolean;
};

export default function DropZone({ onFileSelected, loading }: DropZoneProps) {
  const { t } = useLang();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    onFileSelected(file);
  }

  return (
    <div
      className={`drop-zone ${isDragging ? "is-dragging" : ""} ${loading ? "is-loading" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={t.dropAriaLabel}
      onClick={() => { if (!loading) inputRef.current?.click(); }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !loading) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (!loading) pickFile(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          pickFile(e.target.files);
          e.currentTarget.value = "";
        }}
      />

      <div className="drop-zone-inner">
        <strong>{loading ? t.dropLoading : t.dropTitle}</strong>
        <p className="drop-zone-description">{t.dropDesc}</p>

        {!loading ? (
          <div className="drop-zone-action">
            <span className="drop-zone-button">{t.dropButton}</span>
            <span className="drop-zone-meta">{t.dropOr}</span>
          </div>
        ) : null}

        <div className="drop-zone-format-row">
          <span>MP4</span>
          <span>WebM</span>
          <span>MOV</span>
          <span>AVI</span>
          <span>MKV</span>
        </div>
      </div>
    </div>
  );
}
