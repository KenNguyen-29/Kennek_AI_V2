import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import localFont from "next/font/local";

import { Providers } from "./providers";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Kennek AI — Analytics Command Center",
  description:
    "Industrial AI command center powered by Groq, Tavily, and RAG",
  icons: {
    icon: [{ url: "/logo_Kennek.png", type: "image/png" }],
    apple: [{ url: "/logo_Kennek.png", type: "image/png" }],
    shortcut: ["/logo_Kennek.png"],
  },
};

const themeInitScript = `
(function () {
  try {
    var mode = localStorage.getItem("kennek-theme") || "system";
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var resolved = mode === "system" ? (prefersDark ? "dark" : "light") : mode;
    var root = document.documentElement;
    root.classList.toggle("light", resolved === "light");
    root.classList.toggle("dark", resolved === "dark");
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
    root.style.colorScheme = resolved;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${beVietnam.variable} ${geistMono.variable} ${beVietnam.className} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
