import type { NextConfig } from 'next';
import { assertSandboxKeys } from './src/lib/env';

// Runs on `next dev`, `next build` and `next start`, after Next has loaded .env.
assertSandboxKeys();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray lockfile higher up the tree (e.g. in the home folder) must not be mistaken for the workspace root.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
