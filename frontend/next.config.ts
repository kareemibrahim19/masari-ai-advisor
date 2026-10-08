import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // STATIC_EXPORT=1 builds plain HTML into out/ for static hosting (e.g. a Render static site).
  // Local `npm run dev` / `npm start` are unaffected.
  // trailingSlash writes chat/index.html etc., so /chat works on any static host without rewrite rules.
  ...(process.env.STATIC_EXPORT === "1" && { output: "export", trailingSlash: true }),
};

export default nextConfig;
