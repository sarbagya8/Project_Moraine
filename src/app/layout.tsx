import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./landing.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: {
    default: "ARGUS | Connected Trekking Safety",
    template: "%s | ARGUS",
  },
  description:
    "ARGUS is a hardware-and-software trekking safety prototype that combines wearable readings, location, SOS tracking, a rescue dashboard, and WhatsApp emergency alerts.",
  applicationName: "ARGUS",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "ARGUS | Connected Trekking Safety",
    description:
      "A trekking safety prototype combining wearable readings, location, SOS tracking, a rescue dashboard, and WhatsApp emergency alerts.",
    type: "website",
    siteName: "ARGUS",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "ARGUS connected trekking safety wristband and rescue platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ARGUS | Connected Trekking Safety",
    description:
      "A trekking safety prototype connecting wearable readings, location, SOS tracking, and rescue tools.",
    images: ["/og.png"],
  },
  icons: { icon: "/favicon.ico" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#123e30",
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
