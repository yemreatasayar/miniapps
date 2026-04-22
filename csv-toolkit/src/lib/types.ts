export type Encoding = "utf-8" | "windows-1254" | "windows-1252" | "iso-8859-1";

export type CsvData = {
  headers: string[];
  rows: string[][];
  fileName: string;
  encoding: Encoding;
  delimiter: string;
};

export type ColumnState = {
  name: string;
  alias: string;
  visible: boolean;
  index: number;
};

export type FilterRule = {
  id: string;
  columnIndex: number;
  operator:
    | "contains"
    | "not-contains"
    | "equals"
    | "not-equals"
    | "starts-with"
    | "ends-with"
    | "is-empty"
    | "not-empty";
  value: string;
  caseSensitive: boolean;
};

export type FilterMode = "and" | "or";

export type ReplaceRule = {
  id: string;
  columnIndex: number | "all";
  find: string;
  replace: string;
  caseSensitive: boolean;
  wholeCell: boolean;
};

export type DedupeKey = {
  columnIndex: number;
  enabled: boolean;
};

export type ActiveTab = "columns" | "filter" | "clean" | "merge";

export type MergeFile = {
  data: CsvData;
  joinColumnIndex: number;
};

export type MergeMode = "left" | "inner";
