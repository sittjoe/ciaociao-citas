import type { NextConfig } from 'next'

// TODO: migrate inline scripts to nonces/hashes and drop 'unsafe-inline'/'unsafe-eval' from script-src.
const isDev = process.env.NODE_ENV === 'development'

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : []),
  'https://www.gstatic.com',
  'https://cdn.jsdelivr.net',
  'https://www.google.com',
  'https://www.gstatic.com/recaptcha/',
  'https://apis.google.com',
].join(' ')

const connectSrc = [
  "'self'",
  'https://*.googleapis.com',
  'https://*.firebaseio.com',
  'https://*.cloudfunctions.net',
  'https://api.emailjs.com',
  'https://firestore.googleapis.com',
  'https://identitytoolkit.googleapis.com',
  ...(isDev ? ['ws://localhost:*', 'http://localhost:*'] : []),
].join(' ')

const csp = [
  "default-src 'self' https:",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' https: data: blob:",
  `connect-src ${connectSrc}`,
  'frame-src https://www.google.com/recaptcha/',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Content-Security-Policy', value: csp },
]

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: { allowedOrigins: ['citas.ciaociao.mx', 'localhost:3000'] },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
