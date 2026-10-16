import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'شجرة العائلة',
    short_name: 'شجرة العائلة',
    description: 'استكشف تاريخ عائلتك واحفظه',
    start_url: '/',
    display: 'standalone',
    background_color: '#F1F5F9',
    theme_color: '#1E40AF',
    dir: 'rtl',
    lang: 'ar',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
