/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export — the app is a client-only map reading static JSON,
  // so it deploys behind any static file server (nginx in Docker / Portainer).
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
