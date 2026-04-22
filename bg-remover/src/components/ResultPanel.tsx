type Props = {
  title: string;
  subtitle: string;
  outputSizeLabel: string;
  savingsLabel?: string;
  downloadLabel: string;
  onDownload: () => void;
};

export default function ResultPanel({
  title,
  subtitle,
  outputSizeLabel,
  savingsLabel,
  downloadLabel,
  onDownload,
}: Props) {
  return (
    <div className="workspace-section result-panel">
      <div className="section-header result-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="result-metrics">
        <div className="detail-item">
          <span>Çıktı boyutu</span>
          <strong>{outputSizeLabel}</strong>
        </div>
        {savingsLabel ? (
          <div className="detail-item">
            <span>Boyut farkı</span>
            <strong>{savingsLabel}</strong>
          </div>
        ) : null}
      </div>

      <div className="action-row result-actions">
        <button type="button" className="download-link" onClick={onDownload}>
          {downloadLabel}
        </button>
      </div>
    </div>
  );
}
