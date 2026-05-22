/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  distDir: 'dist/frontend',
  typescript: {
    // Use root tsconfig.json; Next.js type-checking handled separately
    tsconfigPath: './tsconfig.json',
  },
};

export default nextConfig;
