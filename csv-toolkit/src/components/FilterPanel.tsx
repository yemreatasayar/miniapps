import type { FilterMode, FilterRule } from "../lib/types";

type FilterPanelProps = {
  headers: string[];
  rules: FilterRule[];
  mode: FilterMode;
  onRulesChange: (rules: FilterRule[]) => void;
  onModeChange: (mode: FilterMode) => void;
  filteredCount: number;
  totalCount: number;
};

const OPERATORS: Array<{ value: FilterRule["operator"]; label: string }> = [
  { value: "contains", label: "İçerir" },
  { value: "not-contains", label: "İçermez" },
  { value: "equals", label: "Eşittir" },
  { value: "not-equals", label: "Eşit değildir" },
  { value: "starts-with", label: "İle başlar" },
  { value: "ends-with", label: "İle biter" },
  { value: "is-empty", label: "Boştur" },
  { value: "not-empty", label: "Boş değildir" },
];

function createRule(headers: string[]): FilterRule {
  return {
    id: crypto.randomUUID(),
    columnIndex: 0,
    operator: "contains",
    value: "",
    caseSensitive: false,
  };
}

export default function FilterPanel({
  headers,
  rules,
  mode,
  onRulesChange,
  onModeChange,
  filteredCount,
  totalCount,
}: FilterPanelProps) {
  return (
    <section className="panel-card">
      <div className="panel-heading">
        <div>
          <h2>Filtrele</h2>
          <p>Kuralları VE / VEYA mantığıyla uygula.</p>
        </div>
      </div>

      <div className="toggle-row">
        <button type="button" className={mode === "and" ? "is-active" : ""} onClick={() => onModeChange("and")}>
          Tüm kurallar eşleşmeli
        </button>
        <button type="button" className={mode === "or" ? "is-active" : ""} onClick={() => onModeChange("or")}>
          Herhangi bir kural yeterli
        </button>
      </div>

      <div className="stack-list">
        {rules.map((rule) => (
          <div key={rule.id} className="rule-card">
            <select
              value={rule.columnIndex}
              onChange={(event) =>
                onRulesChange(
                  rules.map((item) =>
                    item.id === rule.id ? { ...item, columnIndex: Number(event.target.value) } : item
                  )
                )
              }
            >
              {headers.map((header, index) => (
                <option key={`${header}-${index}`} value={index}>
                  {header}
                </option>
              ))}
            </select>

            <select
              value={rule.operator}
              onChange={(event) =>
                onRulesChange(
                  rules.map((item) =>
                    item.id === rule.id
                      ? { ...item, operator: event.target.value as FilterRule["operator"] }
                      : item
                  )
                )
              }
            >
              {OPERATORS.map((operator) => (
                <option key={operator.value} value={operator.value}>
                  {operator.label}
                </option>
              ))}
            </select>

            {rule.operator !== "is-empty" && rule.operator !== "not-empty" ? (
              <input
                value={rule.value}
                placeholder="Değer"
                onChange={(event) =>
                  onRulesChange(
                    rules.map((item) => (item.id === rule.id ? { ...item, value: event.target.value } : item))
                  )
                }
              />
            ) : null}

            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={rule.caseSensitive}
                onChange={(event) =>
                  onRulesChange(
                    rules.map((item) =>
                      item.id === rule.id ? { ...item, caseSensitive: event.target.checked } : item
                    )
                  )
                }
              />
              <span>Büyük/küçük harf duyarlı</span>
            </label>

            <button
              type="button"
              className="danger-text-button"
              onClick={() => onRulesChange(rules.filter((item) => item.id !== rule.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="panel-footer">
        <button type="button" onClick={() => onRulesChange([...rules, createRule(headers)])}>
          Kural Ekle
        </button>
        <span>
          {totalCount} satırdan {filteredCount} tanesi eşleşiyor
        </span>
      </div>
    </section>
  );
}
