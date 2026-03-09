import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: [
    '@petter100/emai',
    '@libsql/client',
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
