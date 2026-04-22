import type { LoadedImage } from "../lib/types";

type ImageCardProps = {
  image: LoadedImage;
  checked: boolean;
  visibleIndex: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  onSelectionChange: (checked: boolean) => void;
  onRotate: (direction: "cw" | "ccw") => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onRemove: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export default function ImageCard({
  image,
  checked,
  visibleIndex,
  rotation,
  flipH,
  flipV,
  onSelectionChange,
  onRotate,
  onFlipH,
  onFlipV,
  onRemove,
}: ImageCardProps) {
  const scaleX = flipH ? -1 : 1;
  const scaleY = flipV ? -1 : 1;

  return (
    <article className={`page-card ${checked ? "is-selected" : ""}`}>
      <div className="page-card-toolbar">
        <label className="page-checkbox">
          <input type="checkbox" checked={checked} onChange={(event) => onSelectionChange(event.target.checked)} />
          <span>Seç</span>
        </label>
        <button type="button" className="image-remove-button" onClick={onRemove} aria-label={`${image.fileName} kaldır`}>
          ✕
        </button>
      </div>

      <div className="page-card-preview image-card-preview">
        <img
          className="page-thumbnail-image"
          src={image.thumbnail}
          alt={image.fileName}
          style={{ transform: `rotate(${rotation}deg) scale(${scaleX}, ${scaleY})` }}
        />
      </div>

      <div className="image-card-actions">
        <button type="button" onClick={() => onRotate("ccw")}>
          ↺
        </button>
        <button type="button" onClick={() => onRotate("cw")}>
          ↻
        </button>
        <button type="button" onClick={onFlipH}>
          Flip H
        </button>
        <button type="button" onClick={onFlipV}>
          Flip V
        </button>
      </div>

      <div className="page-card-meta image-card-meta">
        <strong>{visibleIndex + 1}. {image.fileName}</strong>
        <span>{image.width}×{image.height} · {formatBytes(image.fileSize)}</span>
      </div>
    </article>
  );
}
