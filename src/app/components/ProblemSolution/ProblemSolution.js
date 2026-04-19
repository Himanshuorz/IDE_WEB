import styles from "./ProblemSolution.module.css";

const problemPoints = [
  "Developers prefer web IDEs because they remove setup friction and let coding start immediately.",
  "Most existing web IDEs still depend on remote sandbox servers to run programs.",
  "That remote execution model adds infrastructure cost and raises privacy concerns because source code is sent to a third-party system.",
];

const solutionPoints = [
  "This project shifts execution into the browser instead of using the site as a thin client for a remote runner.",
  "Each supported language runs inside its own isolated Web Worker so the UI remains responsive during execution.",
  "That makes the experience faster to start, cheaper to host, and better for privacy because supported code runs on the user's own machine.",
];

export default function ProblemSolution() {
  return (
    <section className={styles.section} id="approach">
      <div className={styles.intro}>
        <span className={styles.sectionLabel}>Project Idea</span>
        <h2 className={styles.sectionTitle}>Problem And Solution</h2>
        <p className={styles.sectionDescription}>
          WebIDE is built around one simple idea: a browser IDE should execute
          code locally whenever possible instead of forwarding every run to a
          remote sandbox.
        </p>
      </div>

      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardTag}>Problem</div>
          <h3 className={styles.cardTitle}>
            Convenience Often Depends On A Remote Sandbox
          </h3>
          <p className={styles.cardLead}>
            Web IDEs are convenient, but that convenience usually comes from a
            backend service that receives, runs, and returns your code.
          </p>
          <ul className={styles.list}>
            {problemPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </article>

        <article className={styles.card}>
          <div className={`${styles.cardTag} ${styles.cardTagAccent}`}>Solution</div>
          <h3 className={styles.cardTitle}>
            Run Supported Languages Directly In The Browser
          </h3>
          <p className={styles.cardLead}>
            Instead of streaming code to a server, this project loads runtimes
            in-browser and dispatches execution to dedicated workers on the
            user's device.
          </p>
          <ul className={styles.list}>
            {solutionPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
