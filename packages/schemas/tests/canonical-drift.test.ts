import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const BASELINE_ZOD = resolve(repoRoot, "docs/stage-1-baseline/stage_1_project_schema.rev_d.zod.ts");
const PACKAGE_ZOD = resolve(repoRoot, "packages/schemas/src/stage_1_project_schema.rev_d.zod.ts");

const BASELINE_JSON_SCHEMA = resolve(repoRoot, "docs/stage-1-baseline/stage_1_project_file.rev_d.schema.json");
const PACKAGE_JSON_SCHEMA = resolve(repoRoot, "packages/schemas/stage_1_project_file.rev_d.schema.json");

// The canonical Zod file uses `code: z.ZodIssueCode.custom`. Some Zod v4 minor versions
// removed `z.ZodIssueCode` in favor of the literal "custom". If we have to swap it, do it
// here — and ONLY here — and document it in docs/stage-1-implementation-notes.md.
// The expected substitution is documented as the only allowed deviation.
const ALLOWED_SUBSTITUTIONS: Array<{ from: string; to: string }> = [
  { from: "z.ZodIssueCode.custom", to: '"custom"' },
];

function applyAllowedSubstitutions(text: string): string {
  let out = text;
  for (const { from, to } of ALLOWED_SUBSTITUTIONS) {
    out = out.split(from).join(to);
  }
  return out;
}

describe("canonical schema drift", () => {
  it("Zod schema copy matches baseline (modulo documented Zod v4 substitutions)", () => {
    const baseline = readFileSync(BASELINE_ZOD, "utf8");
    const copy = readFileSync(PACKAGE_ZOD, "utf8");

    const baselineHash = sha256(baseline);
    const copyHash = sha256(copy);

    if (baselineHash === copyHash) {
      expect(copyHash).toBe(baselineHash);
      return;
    }

    const baselineWithSubs = applyAllowedSubstitutions(baseline);
    const baselineWithSubsHash = sha256(baselineWithSubs);
    expect(copyHash).toBe(baselineWithSubsHash);
  });

  it("JSON Schema copy matches baseline byte-identically", () => {
    const baseline = readFileSync(BASELINE_JSON_SCHEMA, "utf8");
    const copy = readFileSync(PACKAGE_JSON_SCHEMA, "utf8");
    expect(sha256(copy)).toBe(sha256(baseline));
  });
});
