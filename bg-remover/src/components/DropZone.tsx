import { useRef, useState } from "react";

type Props = {
  onFilesSelected: (files: File[]) => void;
  loading: boolean;
};

export default function DropZone({ onFilesSelected, loading }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFilesSelected(files);
  }

  return (
    <div
      className={`drop-zone ${isDragging ? "is-dragging" : ""} ${loading ? "is-loading" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !loading && inputRef.current?.click()}
      tabIndex={0}
      role="button"
      aria-label="Görsel yüklemek için tıkla veya sürükle bırak"
      onKeyDown={(event) => {
        if (event.key === "Enter" && !loading) inputRef.current?.click();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        style={{ display: "none" }}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onFilesSelected(files);
          event.target.value = "";
        }}
      />
      <div className="drop-zone-inner">
        <strong>{loading ? "İşleniyor…" : "Görselleri buraya bırak"}</strong>
        <p className="drop-zone-description">
          PNG, JPG, WEBP ve diğer görsel formatlarını tek seferde ekleyebilirsin.
        </p>
        {!loading ? (
          <div className="drop-zone-action">
            <span className="drop-zone-button">Dosya Seç</span>
            <span className="drop-zone-meta">veya çoklu sürükle bırak</span>
          </div>
        ) : null}
        <div className="drop-zone-format-row">
          <span>PNG</span>
          <span>JPG</span>
          <span>WEBP</span>
          <span>AVIF</span>
        </div>
      </div>
    </div>
  );
}
