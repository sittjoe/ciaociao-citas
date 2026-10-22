import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: { allowedOrigins: ['citas.ciaociao.mx', 'localhost:3000'] },
  },
  // Páginas privadas de la clienta (reserva, confirmación, invitados): nunca
  // indexables ni cacheables por proxies. Las páginas dinámicas ya salen con
  // no-store; aquí se refuerza y se cubre la API de acceso.
  async headers() {
    const privateHeaders = [
      { key: 'X-Robots-Tag',  value: 'noindex, nofollow' },
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
    ]
    return [
      { source: '/reserva/:path*',     headers: privateHeaders },
      { source: '/confirmar/:path*',   headers: privateHeaders },
      { source: '/invitado/:path*',    headers: privateHeaders },
      { source: '/api/reserva/:path*', headers: privateHeaders },
    ]
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Sin imágenes remotas: todo <Image> del sitio usa archivos de /public.
    // Los comodines de storage.googleapis.com / firebasestorage.googleapis.com
    // convertían /_next/image en un proxy abierto hacia CUALQUIER bucket de
    // Google. Las identificaciones se abren con URL firmada (api/admin/id-url),
    // nunca por el optimizador. Si algún día hace falta una imagen remota,
    // agrégala aquí con `pathname` acotado al bucket propio.
    remotePatterns: [],
  },
}

export default nextConfig
