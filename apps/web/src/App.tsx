import { useRef } from "react";
import { getDemoFixture } from "@power-system-study/fixtures";
import { loadProjectFile, serializeProjectFile } from "@power-system-study/project-io";
import { ProjectProvider, useProjectState } from "./state/projectStore.js";
import { EquipmentPalette } from "./components/EquipmentPalette.js";
import { PropertyPanel } from "./components/PropertyPanel.js";
import { DiagramCanvas } from "./components/DiagramCanvas.js";
import { ValidationPanel } from "./components/ValidationPanel.js";

const fontStack =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const styles = {
  shell: {
    fontFamily: fontStack,
    color: "#0d1421",
    height: "100vh",
    display: "grid",
    gridTemplateColumns: "240px 1fr 340px",
    gridTemplateRows: "auto 1fr 220px",
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
  panel: { border: "1px solid #d8dee5", borderRadius: 6, padding: 12, overflow: "auto" as const, minHeight: 0 },
  canvas: { border: "1px solid #d8dee5", borderRadius: 6, overflow: "hidden" as const, minHeight: 0 },
  bottom: { gridColumn: "1 / span 3", border: "1px solid #d8dee5", borderRadius: 6, padding: 12, overflow: "auto" as const },
  button: { padding: "6px 12px", borderRadius: 4, border: "1px solid #2563eb", background: "white", color: "#2563eb", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  buttonPrimary: { padding: "6px 12px", borderRadius: 4, border: "1px solid #2563eb", background: "#2563eb", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  small: { fontSize: 12, color: "#5f6c7b" },
};

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

function EditorLayout() {
  return (
    <div style={styles.shell}>
      <Toolbar />
      <div style={styles.panel}>
        <EquipmentPalette />
      </div>
      <div style={styles.canvas}>
        <DiagramCanvas />
      </div>
      <div style={styles.panel}>
        <PropertyPanel />
      </div>
      <div style={styles.bottom}>
        <ValidationPanel />
      </div>
    </div>
  );
}

export function App() {
  return (
    <ProjectProvider>
      <EditorLayout />
    </ProjectProvider>
  );
}
