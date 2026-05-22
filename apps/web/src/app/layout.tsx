import type { Metadata } from "next";
import { Noto_Sans, IBM_Plex_Mono } from "next/font/google";
import "../styles/globals.css";

// Self-hosted at build time by next/font (no runtime Google call).
const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QLD Budget Map",
  description: "Queensland capital projects — proof of concept",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${notoSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
