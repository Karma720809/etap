import type { z } from "zod";
import type { EquipmentKindSchema } from "@power-system-study/schemas";

export type EquipmentKind = z.infer<typeof EquipmentKindSchema>;
