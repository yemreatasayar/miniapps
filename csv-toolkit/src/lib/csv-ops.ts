import Papa from "papaparse";
import type {
  ColumnState,
  CsvData,
  DedupeKey,
  Encoding,
  FilterMode,
  FilterRule,
  MergeFile,
  MergeMode,
  ReplaceRule,
} from "./types";

export async function readCsvFile(file: File, encoding: Encoding): Promise<CsvData> {
  const text = await readFileAsText(file, encoding);
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
  });

  const [headers = [], ...rows] = result.data;

  return {
    headers,
    rows: rows.map((row) => headers.map((_, index) => row[index] ?? "")),
    fileName: file.name,
    encoding,
    delimiter: result.meta.delimiter ?? ",",
  };
}

function readFileAsText(file: File, encoding: Encoding): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`${file.name} okunamadı.`));
    reader.readAsText(file, encoding);
  });
}

export function applyColumns(data: CsvData, columns: ColumnState[]): CsvData {
  const visibleCols = columns.filter((column) => column.visible);

  return {
    ...data,
    headers: visibleCols.map((column) => column.alias),
    rows: data.rows.map((row) => visibleCols.map((column) => row[column.index] ?? "")),
  };
}

export function applyFilters(data: CsvData, rules: FilterRule[], mode: FilterMode): CsvData {
  if (rules.length === 0) return data;

  const filtered = data.rows.filter((row) => {
    const results = rules.map((rule) => matchesRule(row, rule));
    return mode === "and" ? results.every(Boolean) : results.some(Boolean);
  });

  return { ...data, rows: filtered };
}

function matchesRule(row: string[], rule: FilterRule): boolean {
  const raw = row[rule.columnIndex] ?? "";
  const cell = rule.caseSensitive ? raw : raw.toLowerCase();
  const value = rule.caseSensitive ? rule.value : rule.value.toLowerCase();

  switch (rule.operator) {
    case "contains":
      return cell.includes(value);
    case "not-contains":
      return !cell.includes(value);
    case "equals":
      return cell === value;
    case "not-equals":
      return cell !== value;
    case "starts-with":
      return cell.startsWith(value);
    case "ends-with":
      return cell.endsWith(value);
    case "is-empty":
      return raw.trim() === "";
    case "not-empty":
      return raw.trim() !== "";
    default:
      return true;
  }
}

export function applyReplace(data: CsvData, rules: ReplaceRule[]): CsvData {
  const newRows = data.rows.map((row) =>
    row.map((cell, colIdx) => {
      let result = cell;
      for (const rule of rules) {
        if (!rule.find && !rule.wholeCell) continue;
        if (rule.columnIndex !== "all" && rule.columnIndex !== colIdx) continue;

        if (rule.wholeCell) {
          const matches = rule.caseSensitive
            ? result === rule.find
            : result.toLowerCase() === rule.find.toLowerCase();

          if (matches) result = rule.replace;
        } else {
          const escaped = rule.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          result = result.replace(
            new RegExp(escaped, rule.caseSensitive ? "g" : "gi"),
            rule.replace
          );
        }
      }
      return result;
    })
  );

  return { ...data, rows: newRows };
}

export function applyDedupe(
  data: CsvData,
  keys: DedupeKey[]
): { data: CsvData; removedCount: number } {
  const activeKeys = keys.filter((key) => key.enabled).map((key) => key.columnIndex);

  if (activeKeys.length === 0) {
    return { data, removedCount: 0 };
  }

  const seen = new Set<string>();
  const filtered: string[][] = [];

  for (const row of data.rows) {
    const key = activeKeys.map((index) => row[index] ?? "").join("\u0000");
    if (!seen.has(key)) {
      seen.add(key);
      filtered.push(row);
    }
  }

  return {
    data: { ...data, rows: filtered },
    removedCount: data.rows.length - filtered.length,
  };
}

export function mergeCsv(
  left: CsvData,
  right: MergeFile,
  mode: MergeMode,
  leftJoinCol: number
): CsvData {
  const rightMap = new Map<string, string[]>();

  for (const row of right.data.rows) {
    const key = (row[right.joinColumnIndex] ?? "").trim().toLowerCase();
    if (!rightMap.has(key)) {
      rightMap.set(key, row);
    }
  }

  const rightHeaders = right.data.headers.filter((_, index) => index !== right.joinColumnIndex);
  const rightEmptyRow = rightHeaders.map(() => "");

  const mergedHeaders = [...left.headers, ...rightHeaders];
  const mergedRows: string[][] = [];

  for (const leftRow of left.rows) {
    const key = (leftRow[leftJoinCol] ?? "").trim().toLowerCase();
    const rightRow = rightMap.get(key);

    if (!rightRow && mode === "inner") continue;

    const rightValues = rightRow
      ? rightRow.filter((_, index) => index !== right.joinColumnIndex)
      : rightEmptyRow;

    mergedRows.push([...leftRow, ...rightValues]);
  }

  return {
    headers: mergedHeaders,
    rows: mergedRows,
    fileName: left.fileName,
    encoding: left.encoding,
    delimiter: left.delimiter,
  };
}

export function exportCsv(data: CsvData, delimiter: string): string {
  return Papa.unparse({ fields: data.headers, data: data.rows }, { delimiter });
}

function buildJsonKeys(headers: string[]): string[] {
  const seen = new Map<string, number>();

  return headers.map((header, index) => {
    const baseKey = header.trim() || `column_${index + 1}`;
    const currentCount = seen.get(baseKey) ?? 0;
    seen.set(baseKey, currentCount + 1);
    return currentCount === 0 ? baseKey : `${baseKey}_${currentCount + 1}`;
  });
}

export function convertCsvToJson(data: CsvData): Array<Record<string, string>> {
  const keys = buildJsonKeys(data.headers);
  return data.rows.map((row) =>
    Object.fromEntries(keys.map((key, index) => [key, row[index] ?? ""]))
  );
}

export function exportJson(data: CsvData, spacing = 2): string {
  return JSON.stringify(convertCsvToJson(data), null, spacing);
}

export function downloadCsv(csvText: string, fileName: string): void {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadJson(jsonText: string, fileName: string): void {
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
