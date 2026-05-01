import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode, createElement } from "react";
import { createEquipment, type EquipmentKind } from "@power-system-study/core-model";
import type { PowerSystemProjectFile } from "@power-system-study/schemas";
import { createNewProject } from "./createNewProject.js";

export interface AppState {
  project: PowerSystemProjectFile;
  selectedInternalId: string | null;
  isDirty: boolean;
}

export type AppAction =
  | { type: "addEquipment"; kind: EquipmentKind; now?: string }
  | { type: "updateEquipment"; internalId: string; patch: Record<string, unknown>; now?: string }
  | { type: "selectEquipment"; internalId: string | null }
  | { type: "replaceProject"; project: PowerSystemProjectFile }
  | { type: "markClean" };

// Patches a single equipment record across whichever collection holds it. Pure;
// returns the same project reference if the internalId was not found.
function patchEquipment(
  project: PowerSystemProjectFile,
  internalId: string,
  patch: Record<string, unknown>,
  now: string,
): PowerSystemProjectFile {
  let touched = false;
  function applyTo<T extends { internalId: string }>(list: T[]): T[] {
    let mutated = false;
    const next = list.map((item) => {
      if (item.internalId !== internalId) return item;
      mutated = true;
      // Tag and most fields are user-editable; internalId / kind / createdAt are not.
      const { internalId: _id, kind: _kind, createdAt: _created, ...rest } = patch as Record<string, unknown>;
      void _id; void _kind; void _created;
      return { ...item, ...rest, updatedAt: now } as T;
    });
    if (mutated) touched = true;
    return mutated ? next : list;
  }
  const eq = project.equipment;
  const updated = {
    ...eq,
    utilities: applyTo(eq.utilities),
    generators: applyTo(eq.generators),
    buses: applyTo(eq.buses),
    transformers: applyTo(eq.transformers),
    cables: applyTo(eq.cables),
    breakers: applyTo(eq.breakers),
    switches: applyTo(eq.switches),
    loads: applyTo(eq.loads),
    motors: applyTo(eq.motors),
    placeholders: eq.placeholders ? applyTo(eq.placeholders) : eq.placeholders,
  };
  if (!touched) return project;
  return {
    ...project,
    project: { ...project.project, updatedAt: now },
    equipment: updated,
  };
}

export function projectReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "addEquipment": {
      const now = action.now ?? new Date().toISOString();
      const result = createEquipment(state.project, action.kind, { now });
      return {
        project: result.project,
        selectedInternalId: result.internalId,
        isDirty: true,
      };
    }
    case "updateEquipment": {
      const now = action.now ?? new Date().toISOString();
      const next = patchEquipment(state.project, action.internalId, action.patch, now);
      if (next === state.project) return state;
      return { ...state, project: next, isDirty: true };
    }
    case "selectEquipment":
      if (state.selectedInternalId === action.internalId) return state;
      return { ...state, selectedInternalId: action.internalId };
    case "replaceProject":
      return { project: action.project, selectedInternalId: null, isDirty: false };
    case "markClean":
      if (!state.isDirty) return state;
      return { ...state, isDirty: false };
  }
}

export function initialAppState(now?: string): AppState {
  return {
    project: createNewProject({ now }),
    selectedInternalId: null,
    isDirty: false,
  };
}

interface ProjectContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export interface ProjectProviderProps {
  children: ReactNode;
  initial?: AppState;
}

export function ProjectProvider({ children, initial }: ProjectProviderProps) {
  const [state, dispatch] = useReducer(projectReducer, undefined, () => initial ?? initialAppState());
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return createElement(ProjectContext.Provider, { value }, children);
}

export function useProjectState(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjectState must be used inside ProjectProvider");
  return ctx;
}
