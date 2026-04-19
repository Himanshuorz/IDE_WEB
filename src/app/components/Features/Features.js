import { Code2, WifiOff, Lock, CircleDollarSign, Monitor, Zap } from "lucide-react";
import styles from "./Features.module.css";

const features = [
  {
    icon: <Code2 size={24} />,
    title: "Multi-Runtime",
    description:
      "Python, JavaScript, SQLite, PostgreSQL-style queries, and a lightweight C/C++ runtime are exposed through separate in-browser workers.",
  },
  {
    icon: <WifiOff size={24} />,
    title: "Low Setup Friction",
    description:
      "The focus is to remove environment setup time so users can open the app and begin experimenting quickly.",
  },
  {
    icon: <Lock size={24} />,
    title: "Privacy Aware",
    description:
      "Supported execution happens on the user's device, reducing dependence on third-party compute infrastructure.",
  },
  {
    icon: <CircleDollarSign size={24} />,
    title: "Lower Infra Cost",
    description:
      "Running code in the browser avoids paying for a remote execution server on every single program run.",
  },
  {
    icon: <Monitor size={24} />,
    title: "Responsive UI",
    description:
      "Workers isolate execution from the main thread so the editor and terminal stay usable while tasks are running.",
  },
  {
    icon: <Zap size={24} />,
    title: "Fast Start",
    description:
      "There are no cold-start containers to provision before supported code can execute.",
  },
];

export default function Features() {
  return (
    <section className={styles.features} id="features">
      <span className={styles.sectionLabel}>Core Features</span>
      <h2 className={styles.sectionTitle}>Features</h2>
      <p className={styles.sectionDescription}>
        The project is centered on fast local execution, lower infrastructure
        dependence, and a smoother experience than full manual language setup.
      </p>

      <div className={styles.grid}>
        {features.map((feature) => (
          <div className={styles.card} key={feature.title}>
            <div className={styles.cardIcon}>{feature.icon}</div>
            <h3 className={styles.cardTitle}>{feature.title}</h3>
            <p className={styles.cardDescription}>{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
