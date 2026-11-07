import type { MetadataRoute } from 'next'
import { getSiteSettings } from '@/lib/settings/getSiteSettings'

// Read on every request (not frozen at build time), so the name under the
// home-screen icon is the family's own, from «إعدادات الموقع».
export const dynamic = 'force-dynamic'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { familyName } = await getSiteSettings()
  return {
    name: familyName,
    short_name: familyName,
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
