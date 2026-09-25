import type { MetadataRoute } from "next";

const siteUrl = "https://www.altaraapp.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/api/", "/oauth/", "/oauth2/", "/login.html", "/register.html", "/profile.html"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
