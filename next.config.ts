import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      {
        source: "/app/index.html",
        destination: "/app",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
