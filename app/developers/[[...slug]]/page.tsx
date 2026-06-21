import type { Metadata } from "next";

import { DeveloperPortalClient } from "../components/developer-portal-client";

export const metadata: Metadata = {
  title: "Developer Portal",
  description: "Create and manage ALTARA applications, bots, installs, synced commands, and Bot Token Connection quickstarts.",
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
  return <DeveloperPortalClient initialSlug={resolved.slug || []} />;
}
