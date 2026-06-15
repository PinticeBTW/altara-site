import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      {
        source: "/try",
        destination: "/app/index.html",
        permanent: false,
      },
      {
        source: "/app",
        destination: "/app/index.html",
        permanent: false,
      },
    ];
  },
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
    ];
  },
};

export default nextConfig;
