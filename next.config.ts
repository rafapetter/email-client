import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
