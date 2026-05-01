import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { getDemoFixture } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const JSON_SCHEMA_PATH = resolve(repoRoot, "packages/schemas/stage_1_project_file.rev_d.schema.json");

describe("demo fixture — JSON Schema (AJV)", () => {
  it("passes the Rev D JSON Schema (Draft 2020-12)", () => {
    const schemaText = readFileSync(JSON_SCHEMA_PATH, "utf8");
    const schema = JSON.parse(schemaText);

    // The Rev D JSON Schema declares $schema = draft 2020-12, so use Ajv2020.
    const AjvCtor = (Ajv2020 as unknown as { default?: typeof Ajv2020 }).default ?? Ajv2020;
    const ajv = new (AjvCtor as unknown as new (opts: object) => InstanceType<typeof Ajv2020>)({
      strict: false,
      allErrors: true,
    });
    const addFormatsFn = (addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats;
    (addFormatsFn as unknown as (a: unknown) => void)(ajv);

    const validate = ajv.compile(schema);
    const fixture = getDemoFixture();
    const ok = validate(fixture);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.error(validate.errors?.slice(0, 5));
    }
    expect(ok).toBe(true);
  });
});
