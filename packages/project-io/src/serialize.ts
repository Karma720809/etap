import {
  serializeProjectFile as canonicalSerialize,
  type PowerSystemProjectFile,
} from "@power-system-study/schemas";
import { normalizeProjectFile } from "./normalize.js";

// Stage 1 deterministic serializer:
// 1. Normalize collections (sort equipment by internalId, etc).
// 2. Delegate to canonical serializeProjectFile, which:
//    - revalidates against the strict schema (throws on invalid)
//    - emits top-level keys in STAGE1_TOP_LEVEL_KEY_ORDER
//    - recursively sorts nested object keys via sortJsonKeys
// Trailing newline included (canonical emits "\n" suffix).
export function serializeProjectFile(project: PowerSystemProjectFile, space = 2): string {
  return canonicalSerialize(normalizeProjectFile(project), space);
}
