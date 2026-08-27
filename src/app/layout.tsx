import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: {
    default: "ARGUS | Trekker Safety & Emergency Response",
    template: "%s | ARGUS",
  },
  description:
    "ARGUS connects trekkers, safety devices, phone location, and responders when an expedition needs support.",
  applicationName: "ARGUS",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "ARGUS | Trekker Safety & Emergency Response",
    description:
      "A trekker safety platform for available device telemetry, location, SOS, and responder coordination.",
    type: "website",
    siteName: "ARGUS",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "ARGUS trekker safety and emergency response platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ARGUS | Trekker Safety & Emergency Response",
    description:
      "A trekker safety platform connecting expedition signals, SOS, location, and responders.",
    images: ["/og.png"],
  },
  icons: { icon: "/favicon.ico" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1a3b2b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
