import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdfjs-dist external so its worker file resolves from node_modules
  serverExternalPackages: ['pdfjs-dist'],
};

export default nextConfig;
