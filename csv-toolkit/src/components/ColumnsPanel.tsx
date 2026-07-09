import { useState } from "react";
import type { ColumnState } from "../lib/types";

type ColumnsPanelProps = {
  columns: ColumnState[];
  onChange: (columns: ColumnState[]) => void;
};

export default function ColumnsPanel({ columns, onChange }: ColumnsPanelProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function reorderColumns(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const next = [...columns];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
  }

  return (
    <section className="panel-card">
      <div className="panel-heading">
        <div>
          <h2>Sütunlar</h2>
          <p>Görünürlük, isim ve sıra.</p>
        </div>
        <div className="inline-actions column-actions">
          <button type="button" onClick={() => onChange(columns.map((column) => ({ ...column, visible: true })))}>
            Tümünü Seç
          </button>
          <button type="button" onClick={() => onChange(columns.map((column) => ({ ...column, visible: false })))}>
            Hiçbirini Seç
          </button>
        </div>
      </div>

      <div className="stack-list">
        {columns.map((column, index) => (
          <div
            key={`${column.name}-${column.index}`}
            className="column-row"
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex === null) return;
              reorderColumns(dragIndex, index);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
          >
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={column.visible}
                onChange={(event) =>
                  onChange(
                    columns.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, visible: event.target.checked } : item
                    )
                  )
                }
              />
              <span>⠿</span>
            </label>
            <div className="column-edit">
              <strong>{column.name}</strong>
              <input
                value={column.alias}
                placeholder={column.name}
                onChange={(event) =>
                  onChange(
                    columns.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, alias: event.target.value } : item
                    )
                  )
                }
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
