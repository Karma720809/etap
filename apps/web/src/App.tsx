import { useMemo, useRef, useState } from "react";
import { getDemoFixture } from "@power-system-study/fixtures";
import { loadProjectFile, serializeProjectFile } from "@power-system-study/project-io";
import type { SidecarTransport } from "@power-system-study/solver-adapter";
import { validateProject } from "@power-system-study/validation";
import { ProjectProvider, useProjectState } from "./state/projectStore.js";
import { CalculationProvider } from "./state/calculationStore.js";
import { EquipmentPalette } from "./components/EquipmentPalette.js";
import { ProjectTree } from "./components/ProjectTree.js";
import { PropertyPanel } from "./components/PropertyPanel.js";
import { DiagramCanvas } from "./components/DiagramCanvas.js";
import { ValidationPanel } from "./components/ValidationPanel.js";
import { CalculationStatusPanel } from "./components/CalculationStatusPanel.js";

const fontStack =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const styles = {
  shell: {
    fontFamily: fontStack,
    color: "#0d1421",
    height: "100vh",
    display: "grid",
    gridTemplateColumns: "260px 1fr 360px",
    gridTemplateRows: "auto 1fr 260px",
    gap: 8,
    padding: 8,
    boxSizing: "border-box" as const,
  },
  topBar: {
    gridColumn: "1 / span 3",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "6px 8px",
    border: "1px solid #d8dee5",
    borderRadius: 6,
    background: "#f8fafc",
    flexWrap: "wrap" as const,
  },
  panel: {
    border: "1px solid #d8dee5",
    borderRadius: 6,
    padding: 0,
    overflow: "hidden" as const,
    minHeight: 0,
    display: "flex",
    flexDirection: "column" as const,
  },
  rightPanel: {
    border: "1px solid #d8dee5",
    borderRadius: 6,
    padding: 12,
    overflow: "auto" as const,
    minHeight: 0,
  },
  panelTabs: { display: "flex", borderBottom: "1px solid #e2e8f0" },
  panelBody: { padding: 12, overflow: "auto" as const, flex: 1, minHeight: 0 },
  canvas: { border: "1px solid #d8dee5", borderRadius: 6, overflow: "hidden" as const, minHeight: 0 },
  bottom: {
    gridColumn: "1 / span 3",
    border: "1px solid #d8dee5",
    borderRadius: 6,
    overflow: "hidden" as const,
    display: "flex",
    flexDirection: "column" as const,
    minHeight: 0,
  },
  button: { padding: "6px 12px", borderRadius: 4, border: "1px solid #2563eb", background: "white", color: "#2563eb", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  buttonPrimary: { padding: "6px 12px", borderRadius: 4, border: "1px solid #2563eb", background: "#2563eb", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  small: { fontSize: 12, color: "#5f6c7b" },
  tabButton: (active: boolean) => ({
    flex: 1,
    padding: "6px 10px",
    border: "none",
    borderBottom: active ? "2px solid #2563eb" : "2px solid transparent",
    background: active ? "white" : "#f1f5f9",
    color: active ? "#1d4ed8" : "#475569",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  }),
};

type LeftTab = "palette" | "projectTree";
type BottomTab = "validation" | "calculationStatus";

function Toolbar() {
  const { state, dispatch } = useProjectState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const text = serializeProjectFile(state.project);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.project.project.projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    dispatch({ type: "markClean" });
  };

  const handleOpenClick = () => fileInputRef.current?.click();

  const handleFile = async (file: File) => {
    const text = await file.text();
    const result = loadProjectFile(text);
    if (result.project) {
      dispatch({ type: "replaceProject", project: result.project });
      const warnings = result.schemaWarnings ?? [];
      if (warnings.length > 0) {
        window.alert(`Loaded with ${warnings.length} schema warning(s):\n${warnings.join("\n")}`);
      }
    } else {
      const errs = (result.schemaErrors ?? []).join("\n");
      window.alert(`Failed to load project:\n${errs}`);
    }
  };

  const loadDemo = () => {
    dispatch({ type: "replaceProject", project: getDemoFixture() });
  };

  return (
    <div style={styles.topBar}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <strong style={{ fontSize: 14 }}>{state.project.project.projectName}</strong>
        <span style={styles.small}>
          {state.project.project.standard} · {state.project.project.frequencyHz} Hz · schema {state.project.schemaVersion}
          {state.isDirty ? " · unsaved changes" : ""}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" style={styles.button} onClick={loadDemo}>Load demo fixture</button>
        <button type="button" style={styles.button} onClick={handleOpenClick}>Open JSON</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
        <button type="button" style={styles.buttonPrimary} onClick={handleSave}>Save JSON</button>
      </div>
    </div>
  );
}

function LeftPanel() {
  const [tab, setTab] = useState<LeftTab>("palette");
  return (
    <div style={styles.panel}>
      <div style={styles.panelTabs} role="tablist" aria-label="Left sidebar">
        <button
          type="button"
          style={styles.tabButton(tab === "palette")}
          onClick={() => setTab("palette")}
          role="tab"
          aria-selected={tab === "palette"}
          data-testid="left-tab-palette"
        >
          Palette
        </button>
        <button
          type="button"
          style={styles.tabButton(tab === "projectTree")}
          onClick={() => setTab("projectTree")}
          role="tab"
          aria-selected={tab === "projectTree"}
          data-testid="left-tab-tree"
        >
          Project Tree
        </button>
      </div>
      <div style={styles.panelBody}>
        {tab === "palette" ? <EquipmentPalette /> : <ProjectTree />}
      </div>
    </div>
  );
}

function BottomPanel({ validation }: { validation: ReturnType<typeof validateProject> }) {
  const [tab, setTab] = useState<BottomTab>("validation");
  return (
    <div style={styles.bottom}>
      <div style={styles.panelTabs} role="tablist" aria-label="Bottom panel">
        <button
          type="button"
          style={styles.tabButton(tab === "validation")}
          onClick={() => setTab("validation")}
          role="tab"
          aria-selected={tab === "validation"}
          data-testid="bottom-tab-validation"
        >
          Validation ({validation.issues.length})
        </button>
        <button
          type="button"
          style={styles.tabButton(tab === "calculationStatus")}
          onClick={() => setTab("calculationStatus")}
          role="tab"
          aria-selected={tab === "calculationStatus"}
          data-testid="bottom-tab-calculation"
        >
          Calculation Status
        </button>
      </div>
      <div style={styles.panelBody}>
        {tab === "validation" ? (
          <ValidationPanel />
        ) : (
          <CalculationStatusPanel validation={validation} />
        )}
      </div>
    </div>
  );
}

function EditorLayout({ transport }: { transport?: SidecarTransport | null }) {
  // Single CalculationProvider at the editor-layout root so the
  // diagram canvas overlay and the bottom-panel run controls share
  // the same runtime calculation state.
  const { state } = useProjectState();
  const validation = useMemo(() => validateProject(state.project), [state.project]);
  return (
    <CalculationProvider validation={validation} transport={transport ?? null}>
      <div style={styles.shell}>
        <Toolbar />
        <LeftPanel />
        <div style={styles.canvas}>
          <DiagramCanvas />
        </div>
        <div style={styles.rightPanel}>
          <PropertyPanel />
        </div>
        <BottomPanel validation={validation} />
      </div>
    </CalculationProvider>
  );
}

export interface AppProps {
  /**
   * Solver transport injected at the React root. When omitted, the
   * Run button shows a clear "transport not configured" disabled
   * state. Tests inject a stub; a future desktop wrapper would inject
   * `new StdioSidecarTransport()` here.
   */
  transport?: SidecarTransport | null;
}

export function App(props: AppProps = {}) {
  return (
    <ProjectProvider>
      <EditorLayout transport={props.transport} />
    </ProjectProvider>
  );
}
