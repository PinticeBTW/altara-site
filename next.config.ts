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
};

export default nextConfig;
