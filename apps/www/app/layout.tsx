import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description:
    "Deterministic checks for Effect v4 code, built for people and coding agents.",
  title: {
    default: "Effect Doctor",
    template: "%s · Effect Doctor",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d0c",
};

const SiteMark = () => (
  <span aria-hidden="true" className="site-mark">
    ED
  </span>
);

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="site-header">
          <div className="shell header-inner">
            <Link className="brand" href="/">
              <SiteMark />
              <span>Effect Doctor</span>
            </Link>
            <nav aria-label="Main navigation" className="site-nav">
              <Link href="/rules">Rules</Link>
              <a
                href="https://github.com/ocarinalabs/effect-doctor"
                rel="noreferrer"
                target="_blank"
              >
                GitHub
              </a>
            </nav>
          </div>
        </header>
        <main id="main-content">{children}</main>
        <footer className="site-footer">
          <div className="shell footer-inner">
            <span>Effect v4 only. No telemetry.</span>
            <span>MIT licensed.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
