import { useRef, useState } from "react";

type DropZoneProps = {
  onFileSelected: (file: File) => void;
  loading: boolean;
  accept?: string;
};

export default function DropZone({
  onFileSelected,
  loading,
  accept = "audio/*",
}: DropZoneProps) {
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
      aria-label="Ses dosyası yükle"
      onClick={() => {
        if (!loading) {
          inputRef.current?.click();
        }
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !loading) {
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
        if (!loading) {
          pickFile(event.dataTransfer.files);
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          pickFile(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="drop-zone-inner">
        <strong>{loading ? "İşleniyor..." : "Ses dosyası seç veya sürükle"}</strong>
        <p className="drop-zone-description">MP3, WAV, M4A, OGG, FLAC.</p>

        {!loading ? (
          <div className="drop-zone-action">
            <span className="drop-zone-button">Dosya Seç</span>
            <span className="drop-zone-meta">sürükle bırak da olur</span>
          </div>
        ) : null}

        <div className="drop-zone-format-row">
          <span>MP3</span>
          <span>WAV</span>
          <span>M4A</span>
          <span>OGG</span>
          <span>FLAC</span>
        </div>
      </div>
    </div>
  );
}
