import type { ConvertibleImage } from "../lib/types";

type ImageGridProps = {
  images: ConvertibleImage[];
  onCropRequest: (id: string) => void;
};

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export default function ImageGrid({ images, onCropRequest }: ImageGridProps) {
  return (
    <section className="image-grid">
      {images.map((image) => (
        <article key={image.id} className="image-card">
          <div className="image-media">
            <img src={image.thumbnail} alt={image.fileName} className="image-thumb" />
          </div>

          <div className="image-card-body">
            <h2>{image.fileName}</h2>
            <p>{image.fileName.split(".").pop()?.toUpperCase() ?? "Bilinmiyor"}</p>
            <dl className="detail-list">
              <div>
                <dt>Ölçü</dt>
                <dd>{image.width} × {image.height}</dd>
              </div>
              <div>
                <dt>Boyut</dt>
                <dd>{formatBytes(image.fileSize)}</dd>
              </div>
            </dl>
            <button
              type="button"
              className={`crop-card-btn${image.crop?.enabled ? " is-active" : ""}`}
              onClick={() => onCropRequest(image.id)}
            >
              {image.crop?.enabled ? "Kırpıldı ✓" : "Kırp"}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
