import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import { BusSelectField, NumberField, ReadOnlyText, SelectField, TextField, fieldStyles } from "./Common.js";

type Bus = PowerSystemProjectFile["equipment"]["buses"][number];
type Utility = PowerSystemProjectFile["equipment"]["utilities"][number];
type Transformer = PowerSystemProjectFile["equipment"]["transformers"][number];
type Motor = PowerSystemProjectFile["equipment"]["motors"][number];
type Generator = PowerSystemProjectFile["equipment"]["generators"][number];
type Cable = PowerSystemProjectFile["equipment"]["cables"][number];
type Breaker = PowerSystemProjectFile["equipment"]["breakers"][number];
type Switch = PowerSystemProjectFile["equipment"]["switches"][number];
type Load = PowerSystemProjectFile["equipment"]["loads"][number];
type Placeholder = NonNullable<PowerSystemProjectFile["equipment"]["placeholders"]>[number];

type AnyEquipment = Bus | Utility | Transformer | Motor | Generator | Cable | Breaker | Switch | Load | Placeholder;

export interface FormProps<T> {
  value: T;
  buses: { internalId: string; tag: string }[];
  onPatch: (patch: Partial<T>) => void;
}

const VOLTAGE_TYPES = ["AC", "DC"] as const;
const TOPOLOGIES = ["3P3W", "3P4W", "1P2W", "1P3W", "DC2W", "DC3W"] as const;
const STATUSES = ["in_service", "out_of_service"] as const;
const FLA_SOURCES = ["user_input", "calculated", "vendor_data", "unknown"] as const;
const STARTING_METHODS = ["DOL", "star_delta", "VFD", "soft_starter", "unknown"] as const;
const GENERATOR_MODES = ["out_of_service", "grid_parallel_pq", "pv_voltage_control", "island_isochronous"] as const;
const GROUNDING = ["TN-S", "TN-C", "TN-C-S", "TT", "IT", "solid", "resistance", "ungrounded", "unknown"] as const;

export function CommonHeaderFields(
  props: { internalId: string; kind: string; tag: string; name: string | undefined; onPatch: (p: Record<string, unknown>) => void },
) {
  return (
    <fieldset style={fieldStyles.fieldset}>
      <legend style={fieldStyles.legend}>Identity</legend>
      <ReadOnlyText label="Internal ID" value={props.internalId} />
      <ReadOnlyText label="Kind" value={props.kind} />
      <TextField label="Tag" value={props.tag} onChange={(v) => props.onPatch({ tag: v })} testId="field-tag" />
      <TextField label="Name" value={props.name ?? ""} onChange={(v) => props.onPatch({ name: v })} />
    </fieldset>
  );
}

export function BusForm({ value, onPatch }: FormProps<Bus>) {
  return (
    <>
      <CommonHeaderFields internalId={value.internalId} kind={value.kind} tag={value.tag} name={value.name} onPatch={onPatch as never} />
      <fieldset style={fieldStyles.fieldset}>
        <legend style={fieldStyles.legend}>Bus parameters</legend>
        <NumberField label="Nominal voltage (kV)" value={value.vnKv} onChange={(v) => onPatch({ vnKv: v })} testId="field-vnKv" />
        <SelectField label="Voltage type" value={value.voltageType} options={VOLTAGE_TYPES} onChange={(v) => onPatch({ voltageType: v })} />
        <SelectField label="Topology" value={value.topology} options={TOPOLOGIES} onChange={(v) => onPatch({ topology: v })} />
        <NumberField label="Min voltage (%)" value={value.minVoltagePct} onChange={(v) => onPatch({ minVoltagePct: v })} />
        <NumberField label="Max voltage (%)" value={value.maxVoltagePct} onChange={(v) => onPatch({ maxVoltagePct: v })} />
        <SelectField label="Grounding" value={value.grounding ?? "unknown"} options={GROUNDING} onChange={(v) => onPatch({ grounding: v })} />
      </fieldset>
    </>
  );
}

export function UtilityForm({ value, buses, onPatch }: FormProps<Utility>) {
  return (
    <>
      <CommonHeaderFields internalId={value.internalId} kind={value.kind} tag={value.tag} name={value.name} onPatch={onPatch as never} />
      <fieldset style={fieldStyles.fieldset}>
        <legend style={fieldStyles.legend}>Utility source</legend>
        <BusSelectField label="Connected bus" value={value.connectedBus} buses={buses} onChange={(v) => onPatch({ connectedBus: v })} testId="field-connectedBus" />
        <NumberField label="Nominal voltage (kV)" value={value.vnKv} onChange={(v) => onPatch({ vnKv: v })} />
        <NumberField label="SC level (MVA)" value={value.scLevelMva ?? null} onChange={(v) => onPatch({ scLevelMva: v })} />
        <NumberField label="Fault current (kA)" value={value.faultCurrentKa ?? null} onChange={(v) => onPatch({ faultCurrentKa: v })} />
        <NumberField label="X/R ratio" value={value.xrRatio ?? null} onChange={(v) => onPatch({ xrRatio: v })} />
        <NumberField label="Voltage factor" value={value.voltageFactor ?? null} onChange={(v) => onPatch({ voltageFactor: v })} />
        <SelectField label="Status" value={value.status} options={STATUSES} onChange={(v) => onPatch({ status: v })} />
      </fieldset>
    </>
  );
}

export function TransformerForm({ value, buses, onPatch }: FormProps<Transformer>) {
  return (
    <>
      <CommonHeaderFields internalId={value.internalId} kind={value.kind} tag={value.tag} name={value.name} onPatch={onPatch as never} />
      <fieldset style={fieldStyles.fieldset}>
        <legend style={fieldStyles.legend}>Transformer parameters</legend>
        <BusSelectField label="From bus (HV)" value={value.fromBus} buses={buses} onChange={(v) => onPatch({ fromBus: v })} testId="field-fromBus" />
        <BusSelectField label="To bus (LV)" value={value.toBus} buses={buses} onChange={(v) => onPatch({ toBus: v })} testId="field-toBus" />
        <NumberField label="Rated power (MVA)" value={value.snMva} onChange={(v) => onPatch({ snMva: v })} testId="field-snMva" />
        <NumberField label="HV voltage (kV)" value={value.vnHvKv} onChange={(v) => onPatch({ vnHvKv: v })} />
        <NumberField label="LV voltage (kV)" value={value.vnLvKv} onChange={(v) => onPatch({ vnLvKv: v })} />
        <NumberField label="Impedance %Z" value={value.vkPercent} onChange={(v) => onPatch({ vkPercent: v })} />
        <NumberField label="Resistance %R" value={value.vkrPercent ?? null} onChange={(v) => onPatch({ vkrPercent: v })} />
        <NumberField label="X/R ratio" value={value.xrRatio ?? null} onChange={(v) => onPatch({ xrRatio: v })} />
        <SelectField label="Status" value={value.status} options={STATUSES} onChange={(v) => onPatch({ status: v })} />
      </fieldset>
    </>
  );
}

export function MotorForm({ value, buses, onPatch }: FormProps<Motor>) {
  return (
    <>
      <CommonHeaderFields internalId={value.internalId} kind={value.kind} tag={value.tag} name={value.name} onPatch={onPatch as never} />
      <fieldset style={fieldStyles.fieldset}>
        <legend style={fieldStyles.legend}>Motor parameters</legend>
        <BusSelectField label="Connected bus" value={value.connectedBus} buses={buses} onChange={(v) => onPatch({ connectedBus: v })} />
        <NumberField label="Rated kW" value={value.ratedKw} onChange={(v) => onPatch({ ratedKw: v })} testId="field-ratedKw" />
        <NumberField label="Rated HP" value={value.ratedHp ?? null} onChange={(v) => onPatch({ ratedHp: v })} />
        <NumberField label="Rated voltage (V)" value={value.ratedVoltageV} onChange={(v) => onPatch({ ratedVoltageV: v })} />
        <NumberField label="Efficiency" value={value.efficiency ?? null} onChange={(v) => onPatch({ efficiency: v })} />
        <NumberField label="Power factor" value={value.powerFactor ?? null} onChange={(v) => onPatch({ powerFactor: v })} />
        <NumberField label="FLA (A)" value={value.flaA ?? null} onChange={(v) => onPatch({ flaA: v })} />
        <SelectField label="FLA source" value={value.flaSource} options={FLA_SOURCES} onChange={(v) => onPatch({ flaSource: v })} />
        <SelectField label="Starting method" value={value.startingMethod} options={STARTING_METHODS} onChange={(v) => onPatch({ startingMethod: v })} />
        <SelectField label="Status" value={value.status} options={STATUSES} onChange={(v) => onPatch({ status: v })} />
      </fieldset>
    </>
  );
}

export function GenericPlaceholderForm(
  { value, onPatch }: { value: AnyEquipment; onPatch: (patch: Record<string, unknown>) => void },
) {
  // Stage 1 PR #2 ships dedicated forms for Bus, Utility, Transformer, Motor.
  // Other kinds use this minimal identity-only form per spec §10 placeholder allowance.
  return (
    <>
      <CommonHeaderFields internalId={value.internalId} kind={value.kind} tag={value.tag} name={value.name} onPatch={onPatch} />
      <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
        Detailed editing for <code>{value.kind}</code> arrives in a later iteration.
        The canonical record is preserved and tag/name remain editable.
      </p>
    </>
  );
}

// Read-only Generator hint. We keep an extended placeholder so users still see operating mode.
export function GeneratorForm({ value, buses, onPatch }: FormProps<Generator>) {
  return (
    <>
      <CommonHeaderFields internalId={value.internalId} kind={value.kind} tag={value.tag} name={value.name} onPatch={onPatch as never} />
      <fieldset style={fieldStyles.fieldset}>
        <legend style={fieldStyles.legend}>Generator (preview)</legend>
        <BusSelectField label="Connected bus" value={value.connectedBus} buses={buses} onChange={(v) => onPatch({ connectedBus: v })} />
        <SelectField label="Operating mode" value={value.operatingMode} options={GENERATOR_MODES} onChange={(v) => onPatch({ operatingMode: v })} />
        <NumberField label="Rated MVA" value={value.ratedMva} onChange={(v) => onPatch({ ratedMva: v })} />
        <NumberField label="Rated voltage (kV)" value={value.ratedVoltageKv} onChange={(v) => onPatch({ ratedVoltageKv: v })} />
        <SelectField label="Status" value={value.status} options={STATUSES} onChange={(v) => onPatch({ status: v })} />
      </fieldset>
    </>
  );
}
