import { useRef, useState } from "react";
import type { Encoding } from "../lib/types";

type DropZoneProps = {
  onFileSelected: (file: File) => void;
  encoding: Encoding;
  onEncodingChange: (encoding: Encoding) => void;
};

const ENCODINGS: Array<{ value: Encoding; label: string }> = [
  { value: "utf-8", label: "UTF-8" },
  { value: "windows-1254", label: "Windows-1254 (Türkçe Excel)" },
  { value: "windows-1252", label: "Windows-1252" },
  { value: "iso-8859-1", label: "ISO-8859-1" },
];

export default function DropZone({ onFileSelected, encoding, onEncodingChange }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function acceptFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    onFileSelected(file);
  }

  return (
    <section className={`dropzone-card ${dragging ? "is-dragging" : ""}`}>
      <div className="dropzone-copy">
        <h1>CSV dosyanı yükle ve düzenle.</h1>
        <p>Sütunları seç, filtrele, temizle ve indir.</p>
      </div>

      <div
        className="dropzone-area"
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
          setDragging(true);
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          acceptFile(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
          onChange={(event) => {
            acceptFile(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <div className="dropzone-icon">+</div>
        <strong>CSV dosyasını seç veya sürükle</strong>
        <span>CSV, TSV ve text dosyaları desteklenir.</span>
      </div>

      <div className="encoding-row">
        <label className="field-block">
          <span>Encoding</span>
          <select value={encoding} onChange={(event) => onEncodingChange(event.target.value as Encoding)}>
            {ENCODINGS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <p className="field-note">Türkçe Excel için Windows-1254 gerekebilir.</p>
      </div>
    </section>
  );
}
