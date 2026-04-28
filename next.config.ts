import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      {
        source: "/app/index.html",
        destination: "/app/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
