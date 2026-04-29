import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { CustomCursor } from "./components/custom-cursor";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://altara.app";
const siteDescription =
  "ALTARA is a fast, clean communication app for friends, with private DMs, voice calls, widgets, and simple group spaces.";

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
  keywords: [
    "ALTARA",
    "Discord alternative",
    "chat app",
    "voice calls",
    "private messages",
    "group chat",
    "widgets dashboard",
  ],
  authors: [{ name: "Tomás Nunes" }],
  creator: "Tomás Nunes",
  publisher: "ALTARA",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ALTARA",
    title: "ALTARA | Where friends stay close",
    description: siteDescription,
    images: [
      {
        url: "/altara-app-preview-20260428.png",
        width: 1478,
        height: 885,
        alt: "ALTARA app preview showing widgets, friends, calendar, calls, notes, and DMs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ALTARA | Where friends stay close",
    description: siteDescription,
    images: ["/altara-app-preview-20260428.png"],
  },
  robots: {
    index: true,
    follow: true,
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
        <CustomCursor />
        {children}
      </body>
    </html>
  );
}
