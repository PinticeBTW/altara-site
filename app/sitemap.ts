import type { MetadataRoute } from "next";

const siteUrl = "https://www.altaraapp.com";

const routes = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/features", changeFrequency: "monthly", priority: 0.8 },
  { path: "/discord-alternative", changeFrequency: "monthly", priority: 0.9 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/downloads", changeFrequency: "weekly", priority: 0.8 },
  { path: "/download/linux", changeFrequency: "weekly", priority: 0.8 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.6 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: new URL(route.path, siteUrl).toString(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
