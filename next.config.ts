import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["dukascopy-node"],
  // Prevent nft from bundling the candle CSV directory into serverless functions.
  // The candle-summary API fetches these via HTTP from Vercel's static-asset layer.
  outputFileTracingExcludes: {
    "/api/candle-summary": ["./public/data/candles/**/*"],
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
