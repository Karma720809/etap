import type { ChangeEvent } from "react";

export const fieldStyles = {
  fieldset: { border: "1px solid #cbd5e1", borderRadius: 4, padding: 12, margin: 0, display: "flex", flexDirection: "column" as const, gap: 8 },
  legend: { padding: "0 6px", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "#475569" },
  row: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "center" },
  label: { fontSize: 12, color: "#334155" },
  input: { padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 3, fontSize: 13, fontFamily: "inherit" },
  readonly: { padding: "4px 6px", border: "1px dashed #cbd5e1", borderRadius: 3, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, monospace", color: "#475569", background: "#f8fafc" },
  select: { padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 3, fontSize: 13, fontFamily: "inherit", background: "white" },
};

export interface ReadOnlyTextProps {
  label: string;
  value: string;
}

export function ReadOnlyText({ label, value }: ReadOnlyTextProps) {
  return (
    <div style={fieldStyles.row}>
      <span style={fieldStyles.label}>{label}</span>
      <code style={fieldStyles.readonly}>{value}</code>
    </div>
  );
}

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  testId?: string;
}

export function TextField({ label, value, onChange, testId }: TextFieldProps) {
  return (
    <div style={fieldStyles.row}>
      <label style={fieldStyles.label}>{label}</label>
      <input
        type="text"
        style={fieldStyles.input}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        data-testid={testId}
      />
    </div>
  );
}

export interface NumberFieldProps {
  label: string;
  value: number | null | undefined;
  onChange: (next: number | null) => void;
  step?: number | "any";
  testId?: string;
}

export function NumberField({ label, value, onChange, step = "any", testId }: NumberFieldProps) {
  const display = value === null || value === undefined ? "" : String(value);
  return (
    <div style={fieldStyles.row}>
      <label style={fieldStyles.label}>{label}</label>
      <input
        type="number"
        style={fieldStyles.input}
        value={display}
        step={step}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const text = e.target.value;
          if (text === "") onChange(null);
          else {
            const n = Number(text);
            onChange(Number.isFinite(n) ? n : null);
          }
        }}
        data-testid={testId}
      />
    </div>
  );
}

export interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
  testId?: string;
}

export function SelectField<T extends string>({ label, value, options, onChange, testId }: SelectFieldProps<T>) {
  return (
    <div style={fieldStyles.row}>
      <label style={fieldStyles.label}>{label}</label>
      <select
        style={fieldStyles.select}
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as T)}
        data-testid={testId}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

export interface BusSelectFieldProps {
  label: string;
  value: string | null;
  buses: { internalId: string; tag: string }[];
  onChange: (next: string | null) => void;
  testId?: string;
}

export function BusSelectField({ label, value, buses, onChange, testId }: BusSelectFieldProps) {
  return (
    <div style={fieldStyles.row}>
      <label style={fieldStyles.label}>{label}</label>
      <select
        style={fieldStyles.select}
        value={value ?? ""}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value === "" ? null : e.target.value)}
        data-testid={testId}
      >
        <option value="">— none —</option>
        {buses.map((b) => (
          <option key={b.internalId} value={b.internalId}>{b.tag}</option>
        ))}
      </select>
    </div>
  );
}
