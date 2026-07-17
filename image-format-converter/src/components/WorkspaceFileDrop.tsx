import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";

type WorkspaceFileDropProps = {
  children: ReactNode;
  disabled: boolean;
  title: string;
  onFilesDropped: (files: File[]) => void;
};

function hasExternalFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export default function WorkspaceFileDrop({
  children,
  disabled,
  title,
  onFilesDropped,
}: WorkspaceFileDropProps) {
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  function resetDragState() {
    dragDepth.current = 0;
    setIsDragging(false);
  }

  useEffect(() => {
    if (disabled) resetDragState();
  }, [disabled]);

  return (
    <section
      className={`workspace-shell workspace-file-drop${isDragging ? " is-file-dragging" : ""}`}
      onDragEnterCapture={(event) => {
        if (!hasExternalFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current += 1;
        if (!disabled) setIsDragging(true);
      }}
      onDragOverCapture={(event) => {
        if (!hasExternalFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }}
      onDragLeaveCapture={(event) => {
        if (!hasExternalFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragging(false);
      }}
      onDropCapture={(event) => {
        if (!hasExternalFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        const files = Array.from(event.dataTransfer.files);
        resetDragState();
        if (!disabled && files.length > 0) onFilesDropped(files);
      }}
    >
      {children}
      {isDragging && !disabled ? (
        <div className="workspace-drop-overlay" aria-hidden="true">
          <div className="workspace-drop-overlay-card">
            <span className="workspace-drop-overlay-icon">+</span>
            <strong>{title}</strong>
            <span>Mevcut liste ve ayarlar korunur.</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
