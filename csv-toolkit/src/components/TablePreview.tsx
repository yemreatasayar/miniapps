import type { CsvData } from "../lib/types";

type TablePreviewProps = {
  data: CsvData;
  maxRows?: number;
  highlightColumn?: number;
};

export default function TablePreview({
  data,
  maxRows = 100,
  highlightColumn,
}: TablePreviewProps) {
  const rows = data.rows.slice(0, maxRows);

  return (
    <section className="preview-card">
      <div className="panel-heading">
        <div>
          <h2>Önizleme</h2>
          <p>{data.fileName}</p>
        </div>
        <span className="muted-chip">{data.headers.length} sütun</span>
      </div>

      <div className="table-shell">
        <table className="preview-table">
          <thead>
            <tr>
              {data.headers.map((header, index) => (
                <th
                  key={`${header}-${index}`}
                  className={highlightColumn === index ? "is-highlighted" : ""}
                  title={header}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row.join("|")}`}>
                {data.headers.map((_, columnIndex) => (
                  <td
                    key={`${rowIndex}-${columnIndex}`}
                    className={highlightColumn === columnIndex ? "is-highlighted" : ""}
                    title={row[columnIndex] ?? ""}
                  >
                    {row[columnIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="preview-footer">
        {data.rows.length} satırdan {rows.length} gösteriliyor
      </div>
    </section>
  );
}
