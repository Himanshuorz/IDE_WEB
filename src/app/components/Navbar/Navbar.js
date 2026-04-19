import Link from "next/link";
import styles from "./Navbar.module.css";

export default function Navbar() {
  return (
    <nav className={styles.navbar}>
      <Link href="/" className={styles.logo}>
        WEBIDE
      </Link>

      <div className={styles.navLinks}>
        <Link href="#approach" className={styles.navLink}>
          Approach
        </Link>
        <Link href="#features" className={styles.navLink}>
          Features
        </Link>
        <Link href="#techstack" className={styles.navLink}>
          Tech Stack
        </Link>
        <Link href="https://github.com/Krishna-10-7/web_ide" className={styles.navLink} target="_blank">
          GitHub
        </Link>
        <Link href="/ide" className={styles.ctaButton}>
          Open IDE
        </Link>
      </div>
    </nav>
  );
}
