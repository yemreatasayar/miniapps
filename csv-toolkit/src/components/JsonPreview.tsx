import { convertCsvToJson } from "../lib/csv-ops";
import type { CsvData } from "../lib/types";

type JsonPreviewProps = {
  data: CsvData;
  maxRows?: number;
};

export default function JsonPreview({ data, maxRows = 30 }: JsonPreviewProps) {
  const previewRows = data.rows.slice(0, maxRows);
  const previewData = convertCsvToJson({ ...data, rows: previewRows });
  const jsonPreview = JSON.stringify(previewData, null, 2);

  return (
    <section className="preview-card">
      <div className="panel-heading">
        <div>
          <h2>JSON Önizleme</h2>
          <p>Görünür sütunlarla oluşan çıktı</p>
        </div>
        <span className="muted-chip">{previewData.length} kayıt</span>
      </div>

      <div className="json-shell">
        <pre className="json-preview">{jsonPreview}</pre>
      </div>

      <div className="preview-footer">
        {data.rows.length > maxRows ? `${data.rows.length} kaydın ilk ${maxRows} satırı gösteriliyor` : `${data.rows.length} kayıt gösteriliyor`}
      </div>
    </section>
  );
}
