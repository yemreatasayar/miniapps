import type { SanitizableImage } from "../lib/types";

type ImageGridProps = {
  images: SanitizableImage[];
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

export default function ImageGrid({ images }: ImageGridProps) {
  return (
    <section className="image-grid">
      {images.map((image) => (
        <article key={image.id} className="image-card">
          <div className="image-media">
            <img src={image.thumbnail} alt={image.fileName} className="image-thumb" />
          </div>

          <div className="image-card-body">
            <div className="image-card-header">
              <div>
                <h2>{image.fileName}</h2>
                <p>
                  {image.width} × {image.height} · {formatBytes(image.fileSize)}
                </p>
              </div>
            </div>

            <div className="chip-row">
              <span className={`status-chip${image.metadata.hasExif ? " is-active" : ""}`}>
                {image.metadata.hasExif ? "EXIF bulundu" : "EXIF yok"}
              </span>
              <span className={`status-chip${image.metadata.hasGps ? " is-danger" : ""}`}>
                {image.metadata.hasGps ? "GPS bulundu" : "GPS yok"}
              </span>
              <span className="status-chip">Etiket: {image.metadata.tagCount}</span>
            </div>

            <dl className="detail-grid">
              <div>
                <dt>Kamera</dt>
                <dd>{image.metadata.camera ?? "Bulunamadı"}</dd>
              </div>
              <div>
                <dt>Çekim</dt>
                <dd>{image.metadata.capturedAt ?? "Bulunamadı"}</dd>
              </div>
              <div>
                <dt>Yön</dt>
                <dd>{image.metadata.orientation ?? "Standart"}</dd>
              </div>
              <div>
                <dt>Sonuç</dt>
                <dd>{image.metadata.hasExif || image.metadata.hasGps ? "Temizlenecek" : "Yine de temiz kopya üretilecek"}</dd>
              </div>
            </dl>

            {image.metadata.parseWarning ? <p className="inline-note">{image.metadata.parseWarning}</p> : null}
          </div>
        </article>
      ))}
    </section>
  );
}
