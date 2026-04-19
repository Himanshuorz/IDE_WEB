import Link from "next/link";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerLogo}>WEBIDE</div>

      <div className={styles.footerLinks}>
        <Link
          href="https://github.com/Krishna-10-7/web_ide"
          className={styles.footerLink}
          target="_blank"
        >
          GitHub
        </Link>
        <Link href="#approach" className={styles.footerLink}>
          Approach
        </Link>
        <Link href="#features" className={styles.footerLink}>
          Features
        </Link>
        <Link href="#techstack" className={styles.footerLink}>
          Tech Stack
        </Link>
        <Link href="/ide" className={styles.footerLink}>
          Open IDE
        </Link>
      </div>

      <div className={styles.footerRight}>
        © 2026 WebIDE. Browser-native execution.
      </div>
    </footer>
  );
}
