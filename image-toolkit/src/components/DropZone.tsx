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
        onChange={(event) => {
          forwardFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <div className="drop-zone-inner">
        <div className="drop-zone-copy">
          <strong>{loading ? "Görseller yükleniyor..." : "Görselleri bırak, düzenle ve yeniden indir."}</strong>
          <span>
            Toplu görsel düzenleme, yeniden boyutlandırma ve sıkıştırma işlemlerini tek ekrandan hızlıca
            yapabilirsin.
          </span>
        </div>

        <div className="drop-zone-upload-card">
          <span className="drop-zone-upload-label">Dosya yükleme</span>
          <span className="drop-zone-cta">{loading ? "İşleniyor..." : "Görsel Seç"}</span>
          <p>Sürükle bırak da çalışır. JPG, PNG, WebP, GIF, BMP ve HEIC desteklenir.</p>

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
