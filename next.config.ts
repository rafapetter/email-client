import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@petter100/emai',
    'better-sqlite3',
    'imapflow',
    'mailparser',
    'nodemailer',
    'bcryptjs',
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
