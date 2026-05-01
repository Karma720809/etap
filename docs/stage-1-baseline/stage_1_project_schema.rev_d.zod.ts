import { z } from "zod";

// Stage 1 Project Schema Rev D
// Rev D changes loadProjectFile to return schemaWarnings and schemaErrors together
// instead of throwing after pre-parse warnings are collected.

/**
 * Stage 1 runtime schema for Power System Study App project files.
 * Baseline: Stage 1 One-Line Diagram MVP Spec Rev C.
 *
 * Scope:
 * - Schema-level validation for save/load/import boundaries.
 * - Does not perform full engineering validation such as floating-bus checks.
 * - Full semantic validation remains in packages/validation.
 */

export const STAGE1_SCHEMA_VERSION = "1.0.0" as const;
export const STAGE1_TOP_LEVEL_KEY_ORDER = [
  "schemaVersion",
  "appVersion",
  "project",
  "equipment",
  "diagram",
  "scenarios",
  "calculationSnapshots",
  "tagCounters",
  "validation",
] as const;

const nullableNumber = z.number().finite().nullable();
const optionalNullableNumber = z.number().finite().nullable().optional();
const nullableString = z.string().nullable();
const optionalNullableString = z.string().nullable().optional();
const isoDateText = z.string().min(1);

export const StandardBasisSchema = z.enum(["IEC", "NEC", "UserDefined"]);
export const EquipmentKindSchema = z.enum([
  "utility",
  "generator",
  "bus",
  "transformer",
  "cable",
  "breaker",
  "switch",
  "load",
  "motor",
  "mcc_placeholder",
  "switchgear_placeholder",
]);
export const EquipmentStatusSchema = z.enum(["in_service", "out_of_service"]);
export const TagSystemSchema = z.enum(["manual", "auto", "KKS", "plant_tag"]);
export const TopologySchema = z.enum(["3P3W", "3P4W", "1P2W", "1P3W", "DC2W", "DC3W"]);
export const VoltageTypeSchema = z.enum(["AC", "DC"]);

export const BaseEquipmentSchema = z.object({
  internalId: z.string().min(1),
  tag: z.string().min(1),
  kind: EquipmentKindSchema,
  name: z.string().optional(),
  tagSystem: TagSystemSchema.optional(),
  createdAt: isoDateText,
  updatedAt: isoDateText,
}).strict();

export const BusSchema = BaseEquipmentSchema.extend({
  kind: z.literal("bus"),
  vnKv: nullableNumber,
  voltageType: VoltageTypeSchema,
  topology: TopologySchema,
  minVoltagePct: nullableNumber,
  maxVoltagePct: nullableNumber,
  grounding: z.enum([
    "TN-S",
    "TN-C",
    "TN-C-S",
    "TT",
    "IT",
    "solid",
    "resistance",
    "ungrounded",
    "unknown",
  ]).optional(),
}).strict();

export const UtilitySourceSchema = BaseEquipmentSchema.extend({
  kind: z.literal("utility"),
  connectedBus: nullableString,
  vnKv: nullableNumber,
  scLevelMva: optionalNullableNumber,
  faultCurrentKa: optionalNullableNumber,
  xrRatio: optionalNullableNumber,
  voltageFactor: optionalNullableNumber,
  frequencyHz: z.union([z.literal(50), z.literal(60)]).optional(),
  status: EquipmentStatusSchema,
}).strict();

export const GeneratorOperatingModeSchema = z.enum([
  "out_of_service",
  "grid_parallel_pq",
  "pv_voltage_control",
  "island_isochronous",
]);

export const GeneratorSchema = BaseEquipmentSchema.extend({
  kind: z.literal("generator"),
  connectedBus: nullableString,
  ratedMva: nullableNumber,
  ratedVoltageKv: nullableNumber,
  operatingMode: GeneratorOperatingModeSchema,
  pMw: optionalNullableNumber,
  qMvar: optionalNullableNumber,
  powerFactor: optionalNullableNumber,
  voltageSetpointPu: optionalNullableNumber,
  xdSubtransientPu: optionalNullableNumber,
  status: EquipmentStatusSchema,
}).strict();

export const TransformerSchema = BaseEquipmentSchema.extend({
  kind: z.literal("transformer"),
  fromBus: nullableString,
  toBus: nullableString,
  snMva: nullableNumber,
  vnHvKv: nullableNumber,
  vnLvKv: nullableNumber,
  vkPercent: nullableNumber,
  vkrPercent: optionalNullableNumber,
  xrRatio: optionalNullableNumber,
  vectorGroup: optionalNullableString,
  tapPosition: optionalNullableNumber,
  neutralTap: optionalNullableNumber,
  tapStepPercent: optionalNullableNumber,
  coolingType: optionalNullableString,
  loadingLimitPct: optionalNullableNumber,
  status: EquipmentStatusSchema,
}).strict();

export const CableSchema = BaseEquipmentSchema.extend({
  kind: z.literal("cable"),
  fromBus: nullableString,
  toBus: nullableString,
  voltageGradeKv: nullableNumber,
  coreConfiguration: optionalNullableString,
  conductorMaterial: z.enum(["Cu", "Al", "unknown"]),
  insulationType: z.enum(["PVC", "XLPE", "EPR", "unknown"]).optional(),
  armourType: z.enum(["none", "SWA", "AWA", "STA", "unknown"]).optional(),
  conductorSizeMm2: nullableNumber,
  armourCsaMm2: optionalNullableNumber,
  lengthM: nullableNumber,
  rOhmPerKm: optionalNullableNumber,
  xOhmPerKm: optionalNullableNumber,
  ampacityA: optionalNullableNumber,
  installationMethod: z.enum(["tray", "buried", "conduit", "ladder", "air", "unknown"]).optional(),
  ambientTempC: optionalNullableNumber,
  soilResistivityK_m_W: optionalNullableNumber,
  groupingCondition: optionalNullableString,
  loadedConductors: optionalNullableNumber,
  status: EquipmentStatusSchema,
}).strict();

export const LoadTypeSchema = z.enum(["static_load", "mixed_load", "spare", "other"]);
export const LoadSchema = BaseEquipmentSchema.extend({
  kind: z.literal("load"),
  connectedBus: nullableString,
  loadType: LoadTypeSchema,
  kw: nullableNumber,
  kvar: optionalNullableNumber,
  powerFactor: optionalNullableNumber,
  demandFactor: optionalNullableNumber,
  status: EquipmentStatusSchema,
}).strict();

export const MotorStartingMethodSchema = z.enum(["DOL", "star_delta", "VFD", "soft_starter", "unknown"]);
export const FlaSourceSchema = z.enum(["user_input", "calculated", "vendor_data", "unknown"]);
export const MotorSchema = BaseEquipmentSchema.extend({
  kind: z.literal("motor"),
  connectedBus: nullableString,
  ratedKw: nullableNumber,
  ratedHp: optionalNullableNumber,
  ratedVoltageV: nullableNumber,
  efficiency: optionalNullableNumber,
  powerFactor: optionalNullableNumber,
  flaA: optionalNullableNumber,
  flaSource: FlaSourceSchema,
  startingCurrentRatio: optionalNullableNumber,
  startingPowerFactor: optionalNullableNumber,
  startingMethod: MotorStartingMethodSchema,
  serviceFactor: optionalNullableNumber,
  status: EquipmentStatusSchema,
}).strict();

export const SwitchDeviceSchema = BaseEquipmentSchema.extend({
  kind: z.literal("switch"),
  fromBus: nullableString,
  toBus: nullableString,
  state: z.enum(["open", "closed"]),
  normalState: z.enum(["open", "closed"]).optional(),
  ratedVoltageKv: optionalNullableNumber,
  ratedCurrentA: optionalNullableNumber,
  status: EquipmentStatusSchema,
}).strict();

export const ProtectiveDeviceTypeSchema = z.enum(["breaker", "fuse", "relay"]);
export const ProtectiveDeviceSchema = BaseEquipmentSchema.extend({
  kind: z.literal("breaker"),
  deviceType: ProtectiveDeviceTypeSchema,
  fromBus: nullableString,
  toBus: nullableString,
  state: z.enum(["open", "closed"]),
  ratedVoltageKv: nullableNumber,
  ratedCurrentA: nullableNumber,
  breakingCapacityKa: optionalNullableNumber,
  makingCapacityKa: optionalNullableNumber,
  tripUnitType: optionalNullableString,
  clearingTimeS: optionalNullableNumber,
  upstreamEquipment: optionalNullableString,
  downstreamEquipment: optionalNullableString,
  status: EquipmentStatusSchema,
}).strict();

export const PlaceholderEquipmentSchema = BaseEquipmentSchema.extend({
  kind: z.enum(["mcc_placeholder", "switchgear_placeholder"]),
  containedBusIds: z.array(z.string()),
  description: z.string().optional(),
}).strict();

export const EquipmentCollectionsSchema = z.object({
  utilities: z.array(UtilitySourceSchema),
  generators: z.array(GeneratorSchema),
  buses: z.array(BusSchema),
  transformers: z.array(TransformerSchema),
  cables: z.array(CableSchema),
  breakers: z.array(ProtectiveDeviceSchema),
  switches: z.array(SwitchDeviceSchema),
  loads: z.array(LoadSchema),
  motors: z.array(MotorSchema),
  placeholders: z.array(PlaceholderEquipmentSchema).optional(),
}).strict();

export const DiagramNodeSchema = z.object({
  id: z.string().min(1),
  equipmentInternalId: z.string().min(1),
  kind: EquipmentKindSchema,
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }).strict(),
  width: z.number().finite().optional(),
  height: z.number().finite().optional(),
  selected: z.boolean().optional(),
  collapsed: z.boolean().optional(),
}).strict();

export const DiagramEdgeSchema = z.object({
  id: z.string().min(1),
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  kind: z.enum(["connection", "branch_chain"]),
  equipmentInternalId: z.string().optional(),
  branchEquipmentInternalIds: z.array(z.string()).optional(),
  label: z.string().optional(),
}).strict().superRefine((edge, ctx) => {
  if (edge.kind === "branch_chain" && (!edge.branchEquipmentInternalIds || edge.branchEquipmentInternalIds.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["branchEquipmentInternalIds"],
      message: "branch_chain edges must include an ordered branchEquipmentInternalIds array.",
    });
  }
  if (edge.kind === "connection" && edge.branchEquipmentInternalIds !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["branchEquipmentInternalIds"],
      message: "connection edges must not include branchEquipmentInternalIds.",
    });
  }
});

export const DiagramModelSchema = z.object({
  nodes: z.array(DiagramNodeSchema),
  edges: z.array(DiagramEdgeSchema),
  viewport: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().positive(),
  }).strict().optional(),
}).strict();

export const ScenarioOverrideSchema = z.object({
  path: z.string().min(1),
  value: z.unknown(),
  reason: z.string(),
}).strict();

export const ScenarioModelSchema = z.object({
  schemaVersion: z.literal(STAGE1_SCHEMA_VERSION),
  scenarioId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  inheritsFrom: z.null(),
  overrides: z.array(ScenarioOverrideSchema),
}).strict();

export const CalculationSnapshotPlaceholderSchema = z.object({
  snapshotId: z.string().min(1),
  createdAt: isoDateText,
  module: z.enum(["load_flow", "voltage_drop", "short_circuit", "cable_sizing", "equipment_duty"]),
  status: z.literal("placeholder_reserved"),
}).strict();

export const ValidationSeveritySchema = z.enum(["error", "warning", "info"]);
export const ValidationIssueSchema = z.object({
  code: z.string().min(1),
  severity: ValidationSeveritySchema,
  message: z.string().min(1),
  equipmentInternalId: z.string().optional(),
  tag: z.string().optional(),
  field: z.string().optional(),
  path: z.string().optional(),
}).strict();

export const ValidationSummarySchema = z.object({
  status: z.enum(["valid", "warning", "error"]),
  issues: z.array(ValidationIssueSchema),
}).strict();

export const ProjectMetadataSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  client: z.string().optional(),
  plant: z.string().optional(),
  area: z.string().optional(),
  standard: StandardBasisSchema,
  frequencyHz: z.union([z.literal(50), z.literal(60)]),
  defaultVoltageLevelsKv: z.array(z.number().finite().positive()).optional(),
  defaultAmbientTempC: z.number().finite().optional(),
  createdAt: isoDateText,
  updatedAt: isoDateText,
  lastSavedAt: z.string().nullable().optional(),
  lastSavedByText: z.string().nullable().optional(),
}).strict();

export const PowerSystemProjectFileSchema = z.object({
  schemaVersion: z.literal(STAGE1_SCHEMA_VERSION),
  appVersion: z.string().min(1),
  project: ProjectMetadataSchema,
  equipment: EquipmentCollectionsSchema,
  diagram: DiagramModelSchema,
  scenarios: z.array(ScenarioModelSchema),
  calculationSnapshots: z.array(CalculationSnapshotPlaceholderSchema).optional(),
  tagCounters: z.record(z.string(), z.number().int().nonnegative()),
  validation: ValidationSummarySchema.optional(),
}).strict();

export type PowerSystemProjectFile = z.infer<typeof PowerSystemProjectFileSchema>;
export type EquipmentCollections = z.infer<typeof EquipmentCollectionsSchema>;
export type ValidationSummary = z.infer<typeof ValidationSummarySchema>;

export function parseProjectFile(input: unknown): PowerSystemProjectFile {
  return PowerSystemProjectFileSchema.parse(input);
}

export function safeParseProjectFile(input: unknown) {
  return PowerSystemProjectFileSchema.safeParse(input);
}

export interface LoadedProjectFile {
  /** Parsed project, present only when strict schema validation succeeds. */
  project?: PowerSystemProjectFile;
  /** Non-fatal schema/version/key warnings discovered before strict validation. */
  schemaWarnings: string[];
  /** Schema or JSON parse errors. Present when the file cannot be loaded as a Stage 1 project. */
  schemaErrors?: string[];
  /** Saved validation from the file. Audit reference only, not authoritative runtime validation. */
  savedValidation?: ValidationSummary;
}

const allowedTopLevelKeys = new Set<string>(STAGE1_TOP_LEVEL_KEY_ORDER);

/**
 * Reference loader for Stage 1 project files.
 *
 * Responsibilities:
 * - Parse JSON text.
 * - Report unknown top-level keys before strict schema validation.
 * - Enforce Stage 1 schemaVersion.
 * - Return schemaWarnings and schemaErrors without swallowing either.
 * - Return the saved validation summary as an audit reference only when strict parsing succeeds.
 *
 * Runtime semantic validation must be run by packages/validation immediately
 * after this loader returns. The saved validation summary is not authoritative.
 */
export function loadProjectFile(jsonText: string): LoadedProjectFile {
  const schemaWarnings: string[] = [];
  let raw: unknown;

  try {
    raw = JSON.parse(jsonText);
  } catch (error) {
    return {
      schemaWarnings,
      schemaErrors: [`Invalid JSON project file: ${(error as Error).message}`],
    };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      schemaWarnings,
      schemaErrors: ["Project file root must be a JSON object."],
    };
  }

  for (const key of Object.keys(raw as Record<string, unknown>)) {
    if (!allowedTopLevelKeys.has(key)) {
      schemaWarnings.push(`Unknown top-level key '${key}' will be rejected by the Stage 1 strict schema.`);
    }
  }

  const schemaVersion = (raw as Record<string, unknown>).schemaVersion;
  if (schemaVersion !== STAGE1_SCHEMA_VERSION) {
    schemaWarnings.push(`Project schemaVersion is '${String(schemaVersion)}'; expected '${STAGE1_SCHEMA_VERSION}'. Migration may be required.`);
  }

  const parsed = safeParseProjectFile(raw);
  if (!parsed.success) {
    return {
      schemaWarnings,
      schemaErrors: parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
        return `${path}: ${issue.message}`;
      }),
    };
  }

  return {
    project: parsed.data,
    schemaWarnings,
    savedValidation: parsed.data.validation,
  };
}

/**
 * Recursively sorts object keys for deterministic JSON serialization.
 * Arrays keep their existing order; equipment collection arrays should be
 * sorted by internalId before calling this function.
 */
export function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortJsonKeys(obj[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Builds a top-level ordered project object, while recursively sorting nested
 * keys for stable git diffs. Top-level order follows Rev B §12.3.
 */
export function serializeProjectFile(project: PowerSystemProjectFile, space = 2): string {
  const parsed = parseProjectFile(project);
  const ordered: Record<string, unknown> = {};
  for (const key of STAGE1_TOP_LEVEL_KEY_ORDER) {
    if (key in parsed) {
      ordered[key] = sortJsonKeys(parsed[key as keyof PowerSystemProjectFile]);
    }
  }
  return `${JSON.stringify(ordered, null, space)}\n`;
}
