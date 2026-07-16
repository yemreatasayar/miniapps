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
      tabIndex={loading ? -1 : 0}
      aria-disabled={loading}
      className={`drop-zone ${isDragging ? "is-dragging" : ""} ${loading ? "is-loading" : ""}`}
      onClick={() => {
        if (!loading) inputRef.current?.click();
      }}
      onKeyDown={(event) => {
        if (loading) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (loading) return;
        setIsDragging(true);
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (loading) return;
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
        if (loading) return;
        pickFile(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        disabled={loading}
        hidden
        onChange={(event) => {
          pickFile(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <div className="drop-zone-inner">
        <div className="drop-zone-icon" aria-hidden="true">
          <span>+</span>
        </div>
        <strong>{loading ? "Ses önizlemesi hazırlanıyor..." : "Video seç veya sürükle"}</strong>
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
