// Stage 1 canonical bus topology codes. Imported by AppNetwork types so that
// callers receive a precise union without re-deriving it from the Zod schema.
export type Topology = "3P3W" | "3P4W" | "1P2W" | "1P3W" | "DC2W" | "DC3W";

export const SUPPORTED_BUS_TOPOLOGIES: ReadonlySet<Topology> = new Set<Topology>(["3P3W", "3P4W"]);

export function isSupportedBusTopology(t: string): t is "3P3W" | "3P4W" {
  return SUPPORTED_BUS_TOPOLOGIES.has(t as Topology);
}
