// Stage 1 core model — types are inferred from the canonical Zod schema in
// @power-system-study/schemas. Hand-typing parallel interfaces would create drift risk;
// canonical type names from the schema are authoritative.
//
// Re-exported types:
//   PowerSystemProjectFile, EquipmentCollections, ValidationSummary
//
// Plus Zod schema constants and runtime helpers exported from schemas:
//   STAGE1_SCHEMA_VERSION, STAGE1_TOP_LEVEL_KEY_ORDER,
//   parseProjectFile, safeParseProjectFile, loadProjectFile, serializeProjectFile,
//   sortJsonKeys, LoadedProjectFile (interface)

export type {
  PowerSystemProjectFile,
  EquipmentCollections,
  ValidationSummary,
  LoadedProjectFile,
} from "@power-system-study/schemas";

export {
  STAGE1_SCHEMA_VERSION,
  STAGE1_TOP_LEVEL_KEY_ORDER,
  STAGE1_JSON_SCHEMA_FILE,
  parseProjectFile,
  safeParseProjectFile,
  loadProjectFile,
  serializeProjectFile,
  sortJsonKeys,
  PowerSystemProjectFileSchema,
  EquipmentCollectionsSchema,
  EquipmentKindSchema,
  EquipmentStatusSchema,
  BusSchema,
  UtilitySourceSchema,
  GeneratorSchema,
  TransformerSchema,
  CableSchema,
  LoadSchema,
  MotorSchema,
  ProtectiveDeviceSchema,
  SwitchDeviceSchema,
  PlaceholderEquipmentSchema,
  DiagramNodeSchema,
  DiagramEdgeSchema,
  DiagramModelSchema,
  ScenarioModelSchema,
  ValidationIssueSchema,
  ValidationSummarySchema,
  ValidationSeveritySchema,
  ProjectMetadataSchema,
  CalculationSnapshotPlaceholderSchema,
} from "@power-system-study/schemas";

export * from "./ids.js";
export * from "./tag-counters.js";
