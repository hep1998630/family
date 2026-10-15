'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Avatar from '@/components/ui/Avatar'

interface SearchablePerson {
  id: string
  name: string
  nickname: string | null
  photo_url: string | null
  root_name?: string
}

interface SearchBarProps {
  people: SearchablePerson[]
  onSelectPerson: (id: string) => void
}

export default function SearchBar({ people, onSelectPerson }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchablePerson[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Search logic ─────────────────────────────────────────────
  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      setResults([])
      setIsOpen(false)
      setActiveIdx(-1)
      return
    }

    const matched = people.filter(p => {
      const nameMatch = p.name.toLowerCase().includes(q)
      const nicknameMatch = p.nickname?.toLowerCase().includes(q) ?? false
      return nameMatch || nicknameMatch
    }).slice(0, 8)

    setResults(matched)
    setIsOpen(matched.length > 0)
    setActiveIdx(-1)
  }, [query, people])

  // ── Select a result ──────────────────────────────────────────
  const handleSelect = useCallback((person: SearchablePerson) => {
    setQuery('')
    setIsOpen(false)
    setActiveIdx(-1)
    inputRef.current?.blur()
    onSelectPerson(person.id)
  }, [onSelectPerson])

  // ── Keyboard navigation ──────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && results[activeIdx]) {
        handleSelect(results[activeIdx])
      } else if (results[0]) {
        handleSelect(results[0])
      }
    } else if (e.key === 'Escape') {
      setQuery('')
      setIsOpen(false)
      inputRef.current?.blur()
    }
  }

  // ── Close on outside click ───────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Highlight matching text ──────────────────────────────────
  const highlight = (text: string, q: string) => {
    if (!q.trim()) return <>{text}</>
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return <>{text}</>
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-gold/40 text-charcoal rounded px-0.5 not-italic">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div
      ref={containerRef}
      className="absolute top-5 left-1/2 -translate-x-1/2 z-20 w-96"
    >
      {/* ── Input ── */}
      <div
        className={`
          flex items-center gap-3
          bg-white
          border-2 rounded-2xl px-4 py-3
          shadow-card
          transition-all duration-150
          ${focused
            ? 'border-walnut shadow-[0_0_0_3px_rgba(30,64,175,0.15)]'
            : 'border-slate-200'
          }
        `}
      >
        {/* Search icon */}
        <svg
          width="18" height="18" viewBox="0 0 18 18" fill="none"
          className={`flex-shrink-0 transition-colors duration-150 ${focused ? 'text-walnut' : 'text-slate-400'}`}
        >
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="ابحث عن أشخاص…"
          className="
            flex-1 bg-transparent outline-none
            font-sans text-lg text-charcoal
            placeholder:text-slate-400
          "
          aria-label="البحث في أفراد العائلة"
          aria-autocomplete="list"
        />

        {/* Clear button */}
        {query && (
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setQuery(''); setIsOpen(false); inputRef.current?.focus() }}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-charcoal hover:bg-parchment transition-colors"
            aria-label="مسح البحث"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Results dropdown ── */}
      {isOpen && (
        <div
          className="
            absolute top-full left-0 right-0 mt-2
            bg-white
            border-2 border-slate-200
            rounded-2xl shadow-popup
            overflow-hidden
            animate-fade-up
          "
          role="listbox"
        >
          {results.map((person, idx) => (
            <button
              key={person.id}
              role="option"
              aria-selected={idx === activeIdx}
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(person)}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`
                w-full flex items-center gap-3
                px-4 py-3.5 text-right
                transition-colors duration-100
                ${idx === activeIdx
                  ? 'bg-parchment'
                  : 'hover:bg-slate-50'
                }
                ${idx < results.length - 1 ? 'border-b border-slate-100' : ''}
              `}
            >
              <Avatar
                name={person.name}
                photoUrl={person.photo_url}
                size={36}
                className="flex-shrink-0"
              />

              <div className="flex-1 min-w-0">
                <p className="font-sans text-base font-semibold text-charcoal leading-tight truncate">
                  {highlight(person.name, query.trim())}
                </p>
                {person.nickname && (
                  <p className="font-sans text-sm text-walnut-light truncate">
                    {highlight(person.nickname, query.trim())}
                  </p>
                )}
              </div>

              {/* Root name badge */}
              {person.root_name && (
                <span className="
                  flex-shrink-0 font-sans text-sm text-walnut-light
                  bg-parchment border border-slate-200
                  px-3 py-1.5 rounded-lg
                ">
                  {person.root_name}
                </span>
              )}
            </button>
          ))}

          {/* Keyboard hint */}
          <div className="flex items-center justify-end gap-3 px-4 py-3 bg-slate-50 border-t border-slate-100">
            <span className="font-sans text-sm text-walnut-light">↑↓ تنقل</span>
            <span className="font-sans text-sm text-walnut-light">↵ انتقل إلى</span>
          </div>
        </div>
      )}
    </div>
  )
}
