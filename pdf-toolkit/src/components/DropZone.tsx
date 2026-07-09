import { useRef, useState } from "react";
import { getPdfLocale, pdfCopy } from "../lib/i18n";

type DropZoneProps = {
  onFileSelected: (file: File) => void;
  loading?: boolean;
};

export default function DropZone({ onFileSelected, loading = false }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const copy = pdfCopy[getPdfLocale()].dropZone;

  function pickFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    onFileSelected(file);
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
        pickFile(event.dataTransfer.files);
      }}
      disabled={loading}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(event) => {
          pickFile(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <div className="drop-zone-inner">
        <strong>{loading ? copy.loading : copy.title}</strong>
        <span>{copy.description}</span>
      </div>
    </button>
  );
}
