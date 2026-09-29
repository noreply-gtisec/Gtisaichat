/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tell Next.js to use Node.js native require() for pdf-parse
  // instead of bundling it with Turbopack (which picks the browser export)
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
