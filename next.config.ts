import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/oauth2/authorize",
        destination: "/app/index.html",
      },
      {
        source: "/developers",
        destination: "/app/index.html",
      },
      {
        source: "/developers/:path*",
        destination: "/app/index.html",
      },
      {
        source: "/login.html",
        destination: "/app/login.html",
      },
      {
        source: "/register.html",
        destination: "/app/register.html",
      },
      {
        source: "/profile.html",
        destination: "/app/profile.html",
      },
      {
        source: "/style.css",
        destination: "/app/style.css",
      },
      {
        source: "/app.js",
        destination: "/app/app.js",
      },
      {
        source: "/login.js",
        destination: "/app/login.js",
      },
      {
        source: "/register.js",
        destination: "/app/register.js",
      },
      {
        source: "/profile.js",
        destination: "/app/profile.js",
      },
      {
        source: "/ui.js",
        destination: "/app/ui.js",
      },
      {
        source: "/supabaseClient.js",
        destination: "/app/supabaseClient.js",
      },
      {
        source: "/authI18n.js",
        destination: "/app/authI18n.js",
      },
      {
        source: "/authOnboarding.js",
        destination: "/app/authOnboarding.js",
      },
      {
        source: "/presence.js",
        destination: "/app/presence.js",
      },
      {
        source: "/presence-ui.js",
        destination: "/app/presence-ui.js",
      },
      {
        source: "/statusstore.js",
        destination: "/app/statusstore.js",
      },
      {
        source: "/callManager.js",
        destination: "/app/callManager.js",
      },
      {
        source: "/callShared.js",
        destination: "/app/callShared.js",
      },
      {
        source: "/defaultAvatarPool.js",
        destination: "/app/defaultAvatarPool.js",
      },
      {
        source: "/build/:path*",
        destination: "/app/build/:path*",
      },
      {
        source: "/lib/:path*",
        destination: "/app/lib/:path*",
      },
      {
        source: "/theme/:path*",
        destination: "/app/theme/:path*",
      },
      {
        source: "/assets/:path*",
        destination: "/app/assets/:path*",
      },
      {
        source: "/auth/:path*",
        destination: "/app/auth/:path*",
      },
      {
        source: "/sfx/:path*",
        destination: "/app/sfx/:path*",
      },
      {
        source: "/steam/:path*",
        destination: "/app/steam/:path*",
      },
      {
        source: "/node_modules/:path*",
        destination: "/app/node_modules/:path*",
      },
    ];
  },
};

export default nextConfig;
