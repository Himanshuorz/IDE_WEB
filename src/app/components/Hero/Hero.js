import Link from "next/link";
import { Play, Check } from "lucide-react";
import styles from "./Hero.module.css";

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroLeft}>
        <div className={styles.badges}>
          <span className={styles.badge}>Browser IDE</span>
          <span className={styles.badge}>Local Execution</span>
        </div>

        <h1 className={styles.heroTitle}>WEBIDE</h1>

        <p className={styles.heroDescription}>
          A browser-native IDE that aims to reduce setup time without pushing
          every code run to a third-party server. Supported runtimes execute in
          isolated workers on the user&apos;s own machine.
        </p>

        <Link href="/ide" className={styles.heroCta}>
          Start Coding
        </Link>
      </div>

      <div className={styles.heroRight}>
        <div className={styles.dotsGrid}></div>

        <div className={styles.codeNotebook}>
          <div className={styles.notebookHeader}>
            <span className={`${styles.dot} ${styles.dotRed}`}></span>
            <span className={`${styles.dot} ${styles.dotYellow}`}></span>
            <span className={`${styles.dot} ${styles.dotGreen}`}></span>
            <span className={styles.notebookTitle}>WebIDE - main.py</span>
          </div>

          <div className={styles.notebookTabs}>
            <span className={`${styles.tab} ${styles.tabActive}`}>main.py</span>
            <span className={styles.tab}>app.js</span>
            <span className={styles.tab}>query.sql</span>
          </div>

          <div className={styles.notebookBody}>
            <div className={styles.codeLine}>
              <span className={styles.lineNumber}>1</span>
              <span className={styles.codeText}>
                <span className={styles.comment}># Local execution, no remote sandbox</span>
              </span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.lineNumber}>2</span>
              <span className={styles.codeText}>
                <span className={styles.keyword}>import</span> math
              </span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.lineNumber}>3</span>
              <span className={styles.codeText}></span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.lineNumber}>4</span>
              <span className={styles.codeText}>
                <span className={styles.keyword}>def</span>{" "}
                <span className={styles.func}>latency_score</span>(ms):
              </span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.lineNumber}>5</span>
              <span className={styles.codeText}>
                {"    "}
                <span className={styles.keyword}>return</span> math.
                <span className={styles.func}>sqrt</span>(ms * 4)
              </span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.lineNumber}>6</span>
              <span className={styles.codeText}></span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.lineNumber}>7</span>
              <span className={styles.codeText}>
                elapsed = <span className={styles.builtin}>input</span>(
                <span className={styles.string}>&quot;Cold start (ms): &quot;</span>)
              </span>
            </div>
            <div className={styles.codeLine}>
              <span className={styles.lineNumber}>8</span>
              <span className={styles.codeText}>
                <span className={styles.builtin}>print</span>(
                <span className={styles.func}>latency_score</span>(
                <span className={styles.builtin}>int</span>(elapsed)))
              </span>
            </div>
          </div>

          <div className={styles.notebookOutput}>
            <div className={styles.outputLabel}>
              <Play size={12} style={{ display: "inline" }} /> Output
            </div>
            <div>Cold start (ms): 9</div>
            <div>6.0</div>
            <div style={{ color: "#4ade80", marginTop: "4px" }}>
              <Check size={12} style={{ display: "inline", marginRight: 4 }} /> Executed locally in 9ms
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
