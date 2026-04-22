import { useMemo, useState } from "react";
import { mergeCsv, readCsvFile } from "../lib/csv-ops";
import type { CsvData, Encoding, MergeMode } from "../lib/types";

type MergePanelProps = {
  primaryData: CsvData;
  onMerge: (result: CsvData) => void;
  onToast: (message: string) => void;
};

const ENCODINGS: Array<{ value: Encoding; label: string }> = [
  { value: "utf-8", label: "UTF-8" },
  { value: "windows-1254", label: "Windows-1254 (Türkçe Excel)" },
  { value: "windows-1252", label: "Windows-1252" },
  { value: "iso-8859-1", label: "ISO-8859-1" },
];

export default function MergePanel({ primaryData, onMerge, onToast }: MergePanelProps) {
  const [secondaryData, setSecondaryData] = useState<CsvData | null>(null);
  const [secondaryEncoding, setSecondaryEncoding] = useState<Encoding>("utf-8");
  const [leftJoinCol, setLeftJoinCol] = useState(0);
  const [rightJoinCol, setRightJoinCol] = useState(0);
  const [mode, setMode] = useState<MergeMode>("left");
  const [busy, setBusy] = useState(false);

  const canMerge = useMemo(() => secondaryData && primaryData.headers.length > 0, [primaryData.headers.length, secondaryData]);

  async function handleSecondaryFile(file: File) {
    try {
      setBusy(true);
      const data = await readCsvFile(file, secondaryEncoding);
      setSecondaryData(data);
      setRightJoinCol(0);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "İkinci dosya okunamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-card dual-panel">
      <div className="sub-panel">
        <div className="panel-heading">
          <div>
            <h2>Birincil Dosya</h2>
            <p>{primaryData.fileName}</p>
          </div>
        </div>
        <div className="stack-list compact-list">
          {primaryData.headers.map((header, index) => (
            <button
              key={`${header}-${index}`}
              type="button"
              className={`list-chip ${leftJoinCol === index ? "is-active" : ""}`}
              onClick={() => setLeftJoinCol(index)}
            >
              {header}
            </button>
          ))}
        </div>
      </div>

      <div className="sub-panel">
        <div className="panel-heading">
          <div>
            <h2>İkinci Dosya</h2>
            <p>Birleştirme anahtarını seçip sonuç üret.</p>
          </div>
        </div>

        <label className="field-block">
          <span>Encoding</span>
          <select value={secondaryEncoding} onChange={(event) => setSecondaryEncoding(event.target.value as Encoding)}>
            {ENCODINGS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mini-dropzone">
          <input
            hidden
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleSecondaryFile(file);
              }
              event.currentTarget.value = "";
            }}
          />
          <strong>{busy ? "Yükleniyor..." : secondaryData ? secondaryData.fileName : "İkinci CSV'yi seç"}</strong>
          <span>{secondaryData ? `${secondaryData.rows.length} satır, ${secondaryData.headers.length} sütun` : "Birleştirme için ikinci dosya yükle."}</span>
        </label>

        {secondaryData ? (
          <>
            <div className="field-block">
              <span>İkinci dosyada eşleşme sütunu</span>
              <select value={rightJoinCol} onChange={(event) => setRightJoinCol(Number(event.target.value))}>
                {secondaryData.headers.map((header, index) => (
                  <option key={`${header}-${index}`} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </div>

            <div className="toggle-row">
              <button type="button" className={mode === "left" ? "is-active" : ""} onClick={() => setMode("left")}>
                Sol birleştirme
              </button>
              <button type="button" className={mode === "inner" ? "is-active" : ""} onClick={() => setMode("inner")}>
                İç birleştirme
              </button>
            </div>

            <div className="panel-footer">
              <button
                type="button"
                className="primary-button"
                disabled={!canMerge}
                onClick={() => {
                  if (!secondaryData) return;
                  const result = mergeCsv(
                    primaryData,
                    { data: secondaryData, joinColumnIndex: rightJoinCol },
                    mode,
                    leftJoinCol
                  );
                  onMerge(result);
                }}
              >
                Birleştir
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
