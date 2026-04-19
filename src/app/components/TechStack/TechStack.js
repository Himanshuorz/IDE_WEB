import {
  Code2,
  TerminalSquare,
  Atom,
  FileCode2,
  Database,
  HardDrive,
  Cpu,
  Cog,
  Shield,
  FolderOpen,
  Save,
  Layers,
  Rocket,
  Monitor,
  Cloud,
} from "lucide-react";
import styles from "./TechStack.module.css";

const layers = [
  {
    name: "Editor & UI",
    items: [
      { icon: <Code2 size={18} />, label: "Monaco Editor" },
      { icon: <TerminalSquare size={18} />, label: "xterm.js" },
      { icon: <Atom size={18} />, label: "Next.js / React" },
    ],
  },
  {
    name: "Runtimes",
    items: [
      { icon: <FileCode2 size={18} />, label: "Pyodide" },
      { icon: <Code2 size={18} />, label: "JavaScript Worker" },
      { icon: <Cog size={18} />, label: "JSCPP" },
    ],
  },
  {
    name: "Databases",
    items: [
      { icon: <Database size={18} />, label: "sql.js (SQLite)" },
      { icon: <HardDrive size={18} />, label: "PGlite (Postgres)" },
    ],
  },
  {
    name: "System",
    items: [
      { icon: <Cpu size={18} />, label: "Browser Runtime" },
      { icon: <Layers size={18} />, label: "SharedArrayBuffer" },
      { icon: <Shield size={18} />, label: "Web Workers" },
    ],
  },
  {
    name: "Storage",
    items: [
      { icon: <FolderOpen size={18} />, label: "OPFS" },
      { icon: <Database size={18} />, label: "IndexedDB" },
      { icon: <Save size={18} />, label: "localStorage" },
    ],
  },
  {
    name: "Deployment",
    items: [
      { icon: <Rocket size={18} />, label: "Next.js" },
      { icon: <Monitor size={18} />, label: "Static Hosting" },
      { icon: <Cloud size={18} />, label: "Service Worker" },
    ],
  },
];

export default function TechStack() {
  return (
    <section className={styles.techstack} id="techstack">
      <span className={styles.sectionLabel}>Technology</span>
      <h2 className={styles.sectionTitle}>Tech Stack</h2>
      <p className={styles.sectionDescription}>
        The architecture emphasizes browser execution, worker isolation, and
        local persistence instead of remote sandboxes.
      </p>

      <div className={styles.layers}>
        {layers.map((layer) => (
          <div className={styles.layer} key={layer.name}>
            <div className={styles.layerName}>{layer.name}</div>
            <div className={styles.techItems}>
              {layer.items.map((item) => (
                <div className={styles.techItem} key={item.label}>
                  <span className={styles.techIcon}>{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
