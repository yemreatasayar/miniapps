type ToolbarProps = {
  hasData: boolean;
  busy: boolean;
  outputDelimiter: string;
  onOutputDelimiterChange: (delimiter: string) => void;
  onDownload: () => void;
  onDownloadJson: () => void;
  onReset: () => void;
};

export default function Toolbar({
  hasData,
  busy,
  outputDelimiter,
  onOutputDelimiterChange,
  onDownload,
  onDownloadJson,
  onReset,
}: ToolbarProps) {
  return (
    <section className="toolbar-section">
      <div className="toolbar-group">
        <button type="button" onClick={onReset}>
          Yeni Dosya
        </button>

        <label className="toolbar-select">
          <span>Çıktı Ayracı</span>
          <select value={outputDelimiter} onChange={(event) => onOutputDelimiterChange(event.target.value)}>
            <option value=",">Virgül (,)</option>
            <option value=";">Noktalı Virgül (;)</option>
            <option value={"	"}>Tab</option>
          </select>
        </label>
      </div>

      <div className="toolbar-actions">
        <button type="button" className="primary-button" disabled={!hasData || busy} onClick={onDownload}>
          CSV İndir
        </button>
        <button type="button" disabled={!hasData || busy} onClick={onDownloadJson}>
          JSON İndir
        </button>
      </div>
    </section>
  );
}
