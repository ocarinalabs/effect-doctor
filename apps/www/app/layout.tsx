import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description:
    "Static analysis for Effect v4 TypeScript, for people and coding agents.",
  title: {
    default: "Effect Doctor",
    template: "%s · Effect Doctor",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div className="frame">
          <header className="header">
            <Link className="wordmark" href="/">
              Effect Doctor
            </Link>
            <nav aria-label="Site">
              <Link href="/docs">Docs</Link>
              <Link href="/rules">Rules</Link>
              <a href="https://github.com/ocarinalabs/effect-doctor">GitHub</a>
            </nav>
          </header>
          <main id="main">{children}</main>
          <footer className="footer">
            <span>MIT License</span>
            <a href="https://github.com/ocarinalabs/effect-doctor">
              ocarinalabs/effect-doctor
            </a>
          </footer>
        </div>
      </body>
    </html>
  );
}
