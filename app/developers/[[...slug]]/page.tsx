import type { Metadata } from "next";

import { DeveloperPortalClient } from "../components/developer-portal-client";
import { DeveloperHub } from "../components/developer-space";

export const metadata: Metadata = {
  title: "Developer Portal",
  description: "Create and manage ALTARA applications, bots, installs, synced commands, and Bot Token Connection quickstarts.",
  robots: { index: false, follow: true },
  alternates: {
    canonical: "/developers",
  },
};

type DevelopersPageProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

export default async function DevelopersPage({ params }: DevelopersPageProps) {
  const resolved = await params;
  if (!resolved.slug?.length) return <DeveloperHub />;
  return <DeveloperPortalClient initialSlug={resolved.slug || []} />;
}
