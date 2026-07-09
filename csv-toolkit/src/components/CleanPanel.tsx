import type { DedupeKey, ReplaceRule } from "../lib/types";

type CleanPanelProps = {
  headers: string[];
  replaceRules: ReplaceRule[];
  dedupeKeys: DedupeKey[];
  lastResult: number | null;
  onReplaceRulesChange: (rules: ReplaceRule[]) => void;
  onDedupeKeysChange: (keys: DedupeKey[]) => void;
  onApplyReplace: () => void;
  onApplyDedupe: () => void;
};

function createReplaceRule(): ReplaceRule {
  return {
    id: crypto.randomUUID(),
    columnIndex: "all",
    find: "",
    replace: "",
    caseSensitive: false,
    wholeCell: false,
  };
}

export default function CleanPanel({
  headers,
  replaceRules,
  dedupeKeys,
  lastResult,
  onReplaceRulesChange,
  onDedupeKeysChange,
  onApplyReplace,
  onApplyDedupe,
}: CleanPanelProps) {
  return (
    <section className="panel-card dual-panel">
      <div className="sub-panel">
        <div className="panel-heading">
          <div>
            <h2>Bul &amp; Değiştir</h2>
            <p>Ana veriyi günceller. Geri alma yok.</p>
          </div>
        </div>

        <div className="stack-list">
          {replaceRules.map((rule) => (
            <div key={rule.id} className="rule-card">
              <select
                value={rule.columnIndex}
                onChange={(event) =>
                  onReplaceRulesChange(
                    replaceRules.map((item) =>
                      item.id === rule.id
                        ? {
                            ...item,
                            columnIndex:
                              event.target.value === "all" ? "all" : Number(event.target.value),
                          }
                        : item
                    )
                  )
                }
              >
                <option value="all">Tüm sütunlar</option>
                {headers.map((header, index) => (
                  <option key={`${header}-${index}`} value={index}>
                    {header}
                  </option>
                ))}
              </select>
              <input
                value={rule.find}
                placeholder="Aranan metin"
                onChange={(event) =>
                  onReplaceRulesChange(
                    replaceRules.map((item) =>
                      item.id === rule.id ? { ...item, find: event.target.value } : item
                    )
                  )
                }
              />
              <input
                value={rule.replace}
                placeholder="Yeni metin"
                onChange={(event) =>
                  onReplaceRulesChange(
                    replaceRules.map((item) =>
                      item.id === rule.id ? { ...item, replace: event.target.value } : item
                    )
                  )
                }
              />
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={rule.caseSensitive}
                  onChange={(event) =>
                    onReplaceRulesChange(
                      replaceRules.map((item) =>
                        item.id === rule.id ? { ...item, caseSensitive: event.target.checked } : item
                      )
                    )
                  }
                />
                <span>Büyük/küçük harf duyarlı</span>
              </label>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={rule.wholeCell}
                  onChange={(event) =>
                    onReplaceRulesChange(
                      replaceRules.map((item) =>
                        item.id === rule.id ? { ...item, wholeCell: event.target.checked } : item
                      )
                    )
                  }
                />
                <span>Tam hücre eşleşmesi</span>
              </label>
              <button
                type="button"
                className="danger-text-button"
                onClick={() => onReplaceRulesChange(replaceRules.filter((item) => item.id !== rule.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="panel-footer">
          <button type="button" onClick={() => onReplaceRulesChange([...replaceRules, createReplaceRule()])}>
            Kural Ekle
          </button>
          <button type="button" className="primary-button" onClick={onApplyReplace}>
            Uygula
          </button>
        </div>
      </div>

      <div className="sub-panel">
        <div className="panel-heading">
          <div>
            <h2>Tekilleştir</h2>
            <p>İlk satır korunur. Geri alma yok.</p>
          </div>
        </div>

        <div className="checkbox-grid dedupe-grid">
          {headers.map((header, index) => (
            <label key={`${header}-${index}`} className="checkbox-line dedupe-item">
              <input
                type="checkbox"
                checked={dedupeKeys.find((item) => item.columnIndex === index)?.enabled ?? false}
                onChange={(event) =>
                  onDedupeKeysChange(
                    dedupeKeys.map((item) =>
                      item.columnIndex === index ? { ...item, enabled: event.target.checked } : item
                    )
                  )
                }
              />
              <span>{header}</span>
            </label>
          ))}
        </div>

        <div className="panel-footer">
          <button type="button" className="primary-button" onClick={onApplyDedupe}>
            Tekilleştir
          </button>
          <span>{lastResult === null ? "Henüz çalıştırılmadı." : `${lastResult} tekrarlı satır silindi.`}</span>
        </div>
      </div>
    </section>
  );
}
