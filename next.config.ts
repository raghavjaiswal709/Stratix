import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["dukascopy-node"],
  experimental: {
    // proxy.ts matches /api/*, so Next buffers every request body to allow a
    // second read. The default 10MB cap silently truncates a motion-video
    // batch of full-resolution posters.
    proxyClientMaxBodySize: "128mb",
  },
  outputFileTracingExcludes: {
    "*": ["./scripts/**", "scripts/**"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
