import nextEnv from '@next/env';
import path from 'path';

const { loadEnvConfig } = nextEnv;

// Монорепозиторій: єдине джерело конфігурації — кореневий .env.
// Next.js сам читає .env лише з каталогу застосунку (apps/web), тому без цього
// NEXT_PUBLIC_API_URL не потрапляє у збірку, а API_INTERNAL_URL — у runtime.
// Уже встановлені змінні середовища мають пріоритет і не перезаписуються.
loadEnvConfig(path.resolve(process.cwd(), '../..'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Linting runs at the repository root (eslint.config.mjs); builds must not
  // depend on Next's own ESLint setup.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
