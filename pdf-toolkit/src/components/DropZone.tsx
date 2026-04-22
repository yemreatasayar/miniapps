import { useRef, useState } from "react";

type DropZoneProps = {
  onFileSelected: (file: File) => void;
  loading?: boolean;
};

export default function DropZone({ onFileSelected, loading = false }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
        <strong>{loading ? "PDF yükleniyor..." : "PDF'ini buraya sürükle veya tıkla"}</strong>
        <span>Tek PDF yükleyebilir, sonra sayfaları bölebilir, birleştirebilir, silebilir veya döndürebilirsin.</span>
      </div>
    </button>
  );
}
