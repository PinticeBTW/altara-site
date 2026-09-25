import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { ALTARA_SITE_PLATFORM_AWARE_DOWNLOAD_MARKER } from "./lib/altara-download-platform";
import {
  ALTARA_LINUX_BRANDING_ROUTING_MARKER,
  ALTARA_SITE_LINUX_DOWNLOAD_MARKER,
  ALTARA_SITE_LINUX_INSTALLERS_MARKER,
} from "./lib/altara-linux-release";
import "./globals.css";

const siteUrl = "https://www.altaraapp.com";
const siteDescription =
  "ALTARA is a fast, clean Discord alternative for friends, gaming groups, and small communities, with voice calls, private messages, widgets, and simple group spaces.";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "ALTARA",
  title: {
    default: "ALTARA | Where friends stay close",
    template: "%s | ALTARA",
  },
  description: siteDescription,
  authors: [{ name: "Tomás Nunes" }],
  creator: "Tomás Nunes",
  publisher: "ALTARA",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ALTARA",
    title: "ALTARA | Where friends stay close",
    description: siteDescription,
    images: [
      {
        url: "/altara-home-page-clean.png",
        width: 1592,
        height: 988,
        alt: "ALTARA home page showing widgets, friends, calendar, notes, calls, unread DMs, and active friends",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ALTARA | Where friends stay close",
    description: siteDescription,
    images: ["/altara-home-page-clean.png"],
  },
  other: {
    "altara-site-build-marker": ALTARA_SITE_LINUX_DOWNLOAD_MARKER,
    "altara-site-platform-aware-download-marker":
      ALTARA_SITE_PLATFORM_AWARE_DOWNLOAD_MARKER,
    "altara-site-linux-installers-marker":
      ALTARA_SITE_LINUX_INSTALLERS_MARKER,
    "altara-linux-branding-routing-marker":
      ALTARA_LINUX_BRANDING_ROUTING_MARKER,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
