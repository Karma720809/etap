import type { ValidationCode, ValidationSeverity } from "./codes.js";
import { defaultMessageFor, severityOf } from "./codes.js";

export interface ValidationIssueInput {
  code: ValidationCode;
  message?: string;
  equipmentInternalId?: string;
  tag?: string;
  field?: string;
  path?: string;
}

export interface BuiltValidationIssue {
  code: ValidationCode;
  severity: ValidationSeverity;
  message: string;
  equipmentInternalId?: string;
  tag?: string;
  field?: string;
  path?: string;
}

export function makeIssue(input: ValidationIssueInput): BuiltValidationIssue {
  const issue: BuiltValidationIssue = {
    code: input.code,
    severity: severityOf(input.code),
    message: input.message ?? defaultMessageFor(input.code),
  };
  if (input.equipmentInternalId !== undefined) issue.equipmentInternalId = input.equipmentInternalId;
  if (input.tag !== undefined) issue.tag = input.tag;
  if (input.field !== undefined) issue.field = input.field;
  if (input.path !== undefined) issue.path = input.path;
  return issue;
}

export function summaryStatus(issues: BuiltValidationIssue[]): "valid" | "warning" | "error" {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  return "valid";
}
