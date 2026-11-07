import type { Metadata, Viewport } from 'next'
import { getSiteSettings } from '@/lib/settings/getSiteSettings'
import './globals.css'

// The family's own name (site_settings, migration 008), so each family's
// site shows its own title — «شجرة العائلة» until it's set.
export async function generateMetadata(): Promise<Metadata> {
  const { familyName } = await getSiteSettings()
  return {
    title: familyName,
    description: 'استكشف تاريخ عائلتك واحفظه',
    appleWebApp: { title: familyName },
  }
}

// Next 15 ignores `metadata.viewport`; it has to be its own export.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  )
}
