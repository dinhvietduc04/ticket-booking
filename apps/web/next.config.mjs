import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir:
    process.env.NEXT_DIST_DIR ??
    (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  transpilePackages: ["@ticket-booking/contracts"],
  turbopack: {
    resolveAlias: {
      "@ticket-booking/contracts": path.resolve(
        dirname,
        "../../packages/contracts/src/index.ts",
      ),
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
