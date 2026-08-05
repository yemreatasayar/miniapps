import { useRef, useState } from "react";
import type { ConvertHelperStatus } from "../lib/convert-client";
import { supportedConvertAcceptValue } from "../lib/convert-client";
import { getPdfLocale, pdfCopy } from "../lib/i18n";

type ConvertPanelProps = {
  helperStatus: ConvertHelperStatus | null;
  selectedFiles: File[];
  convertedFileName: string | null;
  convertedIsArchive?: boolean;
  statusMessage: string | null;
  busy?: boolean;
  onFilesSelected: (files: File[]) => void;
  onConvert: () => void;
  onDownload: () => void;
};

export default function ConvertPanel({
  helperStatus,
  selectedFiles,
  convertedFileName,
  convertedIsArchive = false,
  statusMessage,
  busy = false,
  onFilesSelected,
  onConvert,
  onDownload,
}: ConvertPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const copy = pdfCopy[getPdfLocale()].convert;

  const officeAvailable = helperStatus?.officeAvailable === true;
  const officeLabel = helperStatus?.helperDisabled
    ? copy.helperLocalOnly
    : officeAvailable
      ? copy.helperReady
      : copy.helperWaiting;
  const selectedLabel =
    selectedFiles.length === 0
      ? copy.noFile
      : selectedFiles.length === 1
        ? selectedFiles[0]?.name ?? copy.oneFileFallback
        : copy.manyFiles(selectedFiles.length);

  function pickFiles(fileList: FileList | null) {
    onFilesSelected(Array.from(fileList ?? []));
  }

  return (
    <section className="convert-panel">
      <input
        ref={inputRef}
        type="file"
        accept={supportedConvertAcceptValue()}
        multiple
        hidden
        onChange={(event) => {
          pickFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="section-header">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
          <details className="windows-info-inline">
            <summary>{copy.windowsInfoLabel}</summary>
            <span>{copy.windowsInfoDescription}</span>
          </details>
        </div>
        <span className={`convert-status-pill ${officeAvailable ? "is-ready" : ""}`}>
          {officeLabel}
        </span>
      </div>

      <button
        type="button"
        className={`convert-drop-zone ${isDragging ? "is-dragging" : ""}`}
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
          pickFiles(event.dataTransfer.files);
        }}
        disabled={busy}
      >
        <strong>{busy ? copy.dropBusy : copy.dropTitle}</strong>
        <span>{copy.dropDescription}</span>
      </button>

      <div className="convert-selection-card">
        <div>
          <strong>{copy.selectedFile}</strong>
          <span>{selectedLabel}</span>
        </div>
        <button type="button" onClick={onConvert} disabled={busy || selectedFiles.length === 0}>
          {copy.convertButton}
        </button>
      </div>

      {statusMessage ? <div className="status-banner">{statusMessage}</div> : null}

      {convertedFileName ? (
        <div className="convert-result-card">
          <div>
            <strong>{convertedIsArchive ? copy.readyZipTitle : copy.readyTitle}</strong>
            <span>{convertedFileName}</span>
          </div>
          <button type="button" onClick={onDownload} disabled={busy}>
            {convertedIsArchive ? copy.downloadZipButton : copy.downloadButton}
          </button>
        </div>
      ) : null}
    </section>
  );
}
