import { useRef, useState } from "react";

type DropZoneProps = {
  onFileSelected: (file: File) => void;
  loading: boolean;
};

export default function DropZone({ onFileSelected, loading }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function pickFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    onFileSelected(file);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        pickFile(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(event) => {
          pickFile(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <div className="drop-zone-inner">
        <strong>{loading ? "Video yükleniyor..." : "Videonu buraya bırak veya dosya seç"}</strong>
        <span className="drop-zone-description">
          MP4, MKV, AVI, MOV, WebM, FLV, TS ve benzeri video formatlarını tek adımda işleyebilirsin.
        </span>

        <div className="drop-zone-action">
          <span className="drop-zone-button">{loading ? "Yükleniyor..." : "Video Seç"}</span>
          <span className="drop-zone-meta">Drag &amp; drop da desteklenir</span>
        </div>

        <div className="drop-zone-format-row">
          <span>MP4</span>
          <span>MOV</span>
          <span>WEBM</span>
          <span>MKV</span>
        </div>
      </div>
    </div>
  );
}
