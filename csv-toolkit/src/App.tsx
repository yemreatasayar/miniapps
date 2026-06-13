import { useEffect, useMemo, useState } from "react";
import CleanPanel from "./components/CleanPanel";
import ColumnsPanel from "./components/ColumnsPanel";
import DropZone from "./components/DropZone";
import FilterPanel from "./components/FilterPanel";
import JsonPreview from "./components/JsonPreview";
import MergePanel from "./components/MergePanel";
import TablePreview from "./components/TablePreview";
import Toast from "./components/Toast";
import Toolbar from "./components/Toolbar";
import { trackAppEvent, trackProcessSuccess } from "./lib/analytics";
import {
  applyColumns,
  applyDedupe,
  applyFilters,
  applyReplace,
  downloadJson,
  downloadCsv,
  exportCsv,
  exportJson,
  readCsvFile,
} from "./lib/csv-ops";
import type {
  ActiveTab,
  ColumnState,
  CsvData,
  DedupeKey,
  Encoding,
  FilterMode,
  FilterRule,
  ReplaceRule,
} from "./lib/types";

const ENCODING_STORAGE_KEY = "csv-toolkit.encoding";
const OUTPUT_DELIMITER_STORAGE_KEY = "csv-toolkit.outputDelimiter";

function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const isDistribution = window.location.hostname === "miniapps.tr";

export default function App() {
  const logoUrl = `${import.meta.env.BASE_URL}assets/csv-toolkit-logo.svg`;
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [columns, setColumns] = useState<ColumnState[]>([]);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("and");
  const [replaceRules, setReplaceRules] = useState<ReplaceRule[]>([]);
  const [dedupeKeys, setDedupeKeys] = useState<DedupeKey[]>([]);
  const [lastDedupeResult, setLastDedupeResult] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("columns");
  const [encoding, setEncoding] = useState<Encoding>(() => readStoredValue(ENCODING_STORAGE_KEY, "utf-8"));
  const [outputDelimiter, setOutputDelimiter] = useState<string>(() =>
    readStoredValue(OUTPUT_DELIMITER_STORAGE_KEY, ",")
  );
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(ENCODING_STORAGE_KEY, JSON.stringify(encoding));
  }, [encoding]);

  useEffect(() => {
    window.localStorage.setItem(OUTPUT_DELIMITER_STORAGE_KEY, JSON.stringify(outputDelimiter));
  }, [outputDelimiter]);

  const filteredData = useMemo(() => {
    if (!csvData) return null;
    return applyFilters(csvData, filterRules, filterMode);
  }, [csvData, filterRules, filterMode]);

  const processedData = useMemo(() => {
    if (!filteredData) return null;
    return applyColumns(filteredData, columns);
  }, [columns, filteredData]);

  async function handleFileSelected(file: File) {
    const startedAt = performance.now();
    try {
      if (file.size > 50 * 1024 * 1024) {
        setToast("50 MB üzeri CSV dosyalarında tarayıcı belleği zorlanabilir.");
      }

      setBusy(true);
      const data = await readCsvFile(file, encoding);
      setCsvData(data);
      setColumns(
        data.headers.map((name, index) => ({
          name,
          alias: name,
          visible: true,
          index,
        }))
      );
      setFilterRules([]);
      setReplaceRules([]);
      setDedupeKeys(data.headers.map((_, index) => ({ columnIndex: index, enabled: false })));
      setLastDedupeResult(null);
      setActiveTab("columns");
      trackProcessSuccess({
        process_type: "parse",
        duration_ms: Math.round(performance.now() - startedAt),
        input_size_kb: Math.max(1, Math.round(file.size / 1024)),
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "CSV dosyası okunamadı.");
      trackAppEvent("process_error", {
        process_type: "parse",
        error_code: "invalid_input",
        error_stage: "parse",
      });
    } finally {
      setBusy(false);
    }
  }

  function handleApplyReplace() {
    if (!csvData) return;
    const updated = applyReplace(csvData, replaceRules);
    setCsvData(updated);
    setToast("Değiştirme uygulandı.");
    trackProcessSuccess({ process_type: "replace" });
  }

  function handleApplyDedupe() {
    if (!csvData) return;
    const { data: updated, removedCount } = applyDedupe(csvData, dedupeKeys);
    setCsvData(updated);
    setLastDedupeResult(removedCount);
    setToast(removedCount > 0 ? `${removedCount} tekrarlı satır silindi.` : "Tekrarlı satır bulunamadı.");
    trackProcessSuccess({ process_type: "dedupe" });
  }

  function handleDownload() {
    if (!csvData || !processedData) return;
    const csvText = exportCsv(processedData, outputDelimiter);
    const baseName = csvData.fileName.replace(/\.[^.]+$/, "");
    downloadCsv(csvText, `${baseName}_processed.csv`);
    trackAppEvent("export_download", {
      export_format: "csv",
      file_count: 1,
    });
  }

  function handleDownloadJson() {
    if (!csvData || !processedData) return;
    const jsonText = exportJson(processedData);
    const baseName = csvData.fileName.replace(/\.[^.]+$/, "");
    downloadJson(jsonText, `${baseName}_processed.json`);
    trackAppEvent("export_download", {
      export_format: "json",
      file_count: 1,
    });
  }

  function handleMerge(result: CsvData) {
    setCsvData(result);
    setColumns(
      result.headers.map((name, index) => ({
        name,
        alias: name,
        visible: true,
        index,
      }))
    );
    setFilterRules([]);
    setReplaceRules([]);
    setDedupeKeys(result.headers.map((_, index) => ({ columnIndex: index, enabled: false })));
    setLastDedupeResult(null);
    setActiveTab("columns");
    setToast(`Birleştirme tamamlandı: ${result.rows.length} satır, ${result.headers.length} sütun.`);
    trackProcessSuccess({ process_type: "merge" });
  }

  function handleReset() {
    setCsvData(null);
    setColumns([]);
    setFilterRules([]);
    setFilterMode("and");
    setReplaceRules([]);
    setDedupeKeys([]);
    setLastDedupeResult(null);
    setActiveTab("columns");
    setBusy(false);
  }

  return (
    <main className="csv-shell">
      <header className="csv-header">
        <img className="csv-brand-logo" src={logoUrl} alt="CSV Toolkit" />
      </header>

      {!csvData || !filteredData || !processedData ? (
        <DropZone onFileSelected={handleFileSelected} encoding={encoding} onEncodingChange={setEncoding} />
      ) : (
        <div className="app-layout">
          <Toolbar
            hasData={!!csvData}
            busy={busy}
            outputDelimiter={outputDelimiter}
            onOutputDelimiterChange={setOutputDelimiter}
            onDownload={handleDownload}
            onDownloadJson={handleDownloadJson}
            onReset={handleReset}
          />
          <section className="panel-column">
            <div className="panel-workbench">
              <nav className="tab-nav">
                {[
                  ["columns", "Sütunlar"],
                  ["filter", "Filtrele"],
                  ["clean", "Temizle"],
                  ["merge", "Birleştir"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={activeTab === id ? "is-active" : ""}
                    onClick={() => setActiveTab(id as ActiveTab)}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <div className="tab-content">
                {activeTab === "columns" ? (
                  <ColumnsPanel columns={columns} onChange={setColumns} />
                ) : null}

                {activeTab === "filter" ? (
                  <FilterPanel
                    headers={csvData.headers}
                    rules={filterRules}
                    mode={filterMode}
                    onRulesChange={setFilterRules}
                    onModeChange={setFilterMode}
                    filteredCount={filteredData.rows.length}
                    totalCount={csvData.rows.length}
                  />
                ) : null}

                {activeTab === "clean" ? (
                  <CleanPanel
                    headers={csvData.headers}
                    replaceRules={replaceRules}
                    dedupeKeys={dedupeKeys}
                    lastResult={lastDedupeResult}
                    onReplaceRulesChange={setReplaceRules}
                    onDedupeKeysChange={setDedupeKeys}
                    onApplyReplace={handleApplyReplace}
                    onApplyDedupe={handleApplyDedupe}
                  />
                ) : null}

                {activeTab === "merge" ? (
                  <MergePanel primaryData={csvData} onMerge={handleMerge} onToast={setToast} />
                ) : null}
              </div>
            </div>
          </section>

          <div className="preview-section">
            <TablePreview data={processedData} />
            <JsonPreview data={processedData} />
          </div>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
      {isDistribution && (
        <footer className="miniapps-footer">
          <a href="https://miniapps.tr" aria-label="miniapps.tr">
            <img
              src={`${import.meta.env.BASE_URL}assets/miniapps-logo-dark.svg`}
              alt="miniapps.tr"
              className="miniapps-footer-logo"
            />
          </a>
        </footer>
      )}
    </main>
  );
}
