import { useRef, useState } from "react";
import { IMAGE_INPUT_ACCEPT } from "../lib/image-ops";

type DropZoneProps = {
  busy: boolean;
  compact?: boolean;
  onFilesSelected: (files: File[]) => void;
};

export default function DropZone({ busy, compact = false, onFilesSelected }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function emitFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    onFilesSelected(Array.from(fileList));
  }

  return (
    <div
      className={`dropzone-card${compact ? " is-compact" : ""}${isDragging ? " is-dragging" : ""}`}
      role="button"
      tabIndex={0}
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
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        emitFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_INPUT_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          emitFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="dropzone-icon" aria-hidden="true">
        <span>+</span>
      </div>
      <strong>{busy ? "Dosyalar hazırlanıyor..." : compact ? "Daha fazla fotoğraf ekle" : "Fotoğrafları seç veya sürükle"}</strong>
      <span>
        {compact
          ? "JPG, PNG, WebP, HEIC."
          : "EXIF ve GPS izlerini temiz kopyadan kaldır."}
      </span>
    </div>
  );
}
