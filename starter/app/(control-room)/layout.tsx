import type { Metadata, Viewport } from "next";
import { Archivo, Urbanist } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

// Free stand-ins for Bahn's Owners Wide and Duplet Open; swap for the starter's fonts later.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const urbanist = Urbanist({
  subsets: ["latin"],
  variable: "--font-urbanist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Control room · Bahn",
  description: "The orders that need a person, and the decision each one needs.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffef7" },
    { media: "(prefers-color-scheme: dark)", color: "#12110e" },
  ],
};

// Applies a saved light/dark choice before first paint, so the page never flashes.
const themeScript = `try{var t=localStorage.getItem("bahn-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${urbanist.variable}`} suppressHydrationWarning>
      <body>
        <Script id="bahn-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
