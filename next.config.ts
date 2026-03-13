import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default is 10 MB. The admin phone video flow accepts files up to 50 MB.
    proxyClientMaxBodySize: "64mb",
  },
};

export default nextConfig;
