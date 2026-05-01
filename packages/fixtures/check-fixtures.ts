#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { PowerSystemProjectFileSchema } from "@power-system-study/schemas";
import { validateProject } from "@power-system-study/validation";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const FIXTURE_PATH = resolve(repoRoot, "packages/fixtures/src/stage_1_demo_fixture.json");
const JSON_SCHEMA_PATH = resolve(repoRoot, "packages/schemas/stage_1_project_file.rev_d.schema.json");

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
const schema = JSON.parse(readFileSync(JSON_SCHEMA_PATH, "utf8"));

let ok = true;

const zodResult = PowerSystemProjectFileSchema.safeParse(fixture);
if (zodResult.success) {
  console.log("Zod schema:        PASS");
} else {
  console.log("Zod schema:        FAIL");
  for (const issue of zodResult.error.issues.slice(0, 5)) {
    console.log("  -", issue.path.join("."), issue.message);
  }
  ok = false;
}

// JSON Schema dialect is Draft 2020-12, so use Ajv2020.
const AjvCtor = (Ajv2020 as unknown as { default?: typeof Ajv2020 }).default ?? Ajv2020;
const ajv = new (AjvCtor as unknown as new (opts: object) => InstanceType<typeof Ajv2020>)({
  strict: false,
  allErrors: true,
});
const addFormatsFn = (addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats;
(addFormatsFn as unknown as (a: unknown) => void)(ajv);

const validate = ajv.compile(schema);
if (validate(fixture)) {
  console.log("JSON Schema (AJV): PASS");
} else {
  console.log("JSON Schema (AJV): FAIL");
  for (const err of (validate.errors ?? []).slice(0, 5)) {
    console.log("  -", err.instancePath, err.message);
  }
  ok = false;
}

if (zodResult.success) {
  const runtime = validateProject(zodResult.data);
  console.log(`Runtime validation: ${runtime.status.toUpperCase()} (${runtime.issues.length} issues)`);
  if (runtime.issues.length > 0) {
    for (const issue of runtime.issues.slice(0, 5)) {
      console.log(`  - [${issue.code}] ${issue.message}`);
    }
  }
  if (runtime.status === "error") ok = false;
}

if (!ok) {
  console.error("\nFixture check FAILED.");
  process.exit(1);
}
console.log("\nFixture check PASS.");
