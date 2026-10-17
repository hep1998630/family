'use client'

import { useState } from 'react'
import { viewPath } from '@/lib/views'

/**
 * «مشاركة»: on phones with a share sheet, opens it (WhatsApp etc.);
 * elsewhere copies the view's link and says so.
 */
export default function ShareViewButton({ viewId, name }: { viewId: string; name: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const [url, setUrl] = useState('')

  const share = async () => {
    const link = `${window.location.origin}${viewPath(viewId)}`
    setUrl(link)
    const isPhone = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
    if (isPhone && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: name, text: name, url: link })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return // closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(link)
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setStatus('manual')
    }
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={share}
        className="
          h-12 px-4 rounded-xl flex items-center gap-2
          bg-white border-2 border-walnut/30 text-walnut
          font-sans text-base font-bold whitespace-nowrap
          hover:border-walnut transition-colors duration-150
        "
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="15" cy="4.5" r="2.5" /><circle cx="5" cy="10" r="2.5" /><circle cx="15" cy="15.5" r="2.5" />
          <path d="M7.2 8.8l5.6-3.1M7.2 11.2l5.6 3.1" />
        </svg>
        مشاركة
      </button>
      {status === 'copied' && (
        <p role="status" className="absolute top-full mt-2 left-0 z-20 whitespace-nowrap font-sans text-sm font-semibold text-white bg-charcoal rounded-lg px-3 py-2 shadow-popup">
          تم نسخ الرابط
        </p>
      )}
      {status === 'manual' && (
        <div className="absolute top-full mt-2 left-0 z-20 w-72 bg-white border-2 border-slate-200 rounded-xl p-3 shadow-popup flex flex-col gap-2">
          <p className="font-sans text-sm text-walnut-light">انسخ الرابط:</p>
          <input
            readOnly
            dir="ltr"
            value={url}
            onFocus={e => e.currentTarget.select()}
            className="w-full font-sans text-sm text-charcoal bg-parchment rounded-lg px-2 py-2 border border-slate-200"
          />
          <button onClick={() => setStatus('idle')} className="self-end font-sans text-sm font-semibold text-walnut">إغلاق</button>
        </div>
      )}
    </div>
  )
}
