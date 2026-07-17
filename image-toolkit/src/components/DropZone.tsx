import { useRef, useState } from "react";
import { IMAGE_INPUT_ACCEPT, isSupportedImageFile } from "../lib/image-ops";

type DropZoneProps = {
  onFilesSelected: (files: File[]) => void;
  loading: boolean;
};

export default function DropZone({ onFilesSelected, loading }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function forwardFiles(fileList: FileList | null) {
    if (loading) return;
    const files = Array.from(fileList ?? []).filter((file) => isSupportedImageFile(file));
    onFilesSelected(files);
  }

  return (
    <button
      type="button"
      className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = loading ? "none" : "copy";
        if (!loading) setIsDragging(true);
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!loading) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        forwardFiles(event.dataTransfer.files);
      }}
      disabled={loading}
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_INPUT_ACCEPT}
        multiple
        hidden
        disabled={loading}
        onChange={(event) => {
          forwardFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <div className="drop-zone-inner">
        <div className="drop-zone-copy">
          <strong>Görselleri boyutlandır, sıkıştır, kırp ve indir.</strong>
        </div>

        <div className="drop-zone-upload-card">
          <div className="drop-zone-icon" aria-hidden="true">
            <span>+</span>
          </div>
          <strong className="drop-zone-upload-title">
            {loading ? (
              "Görseller yükleniyor..."
            ) : (
              <>
                <span className="drop-zone-title-line">Görselleri seç</span>
                <span className="drop-zone-title-line">veya sürükle.</span>
              </>
            )}
          </strong>
          <div className="drop-zone-formats" aria-hidden="true">
            <span>JPG</span>
            <span>PNG</span>
            <span>WEBP</span>
            <span>GIF</span>
            <span>BMP</span>
            <span>HEIC</span>
          </div>
        </div>
      </div>
    </button>
  );
}
