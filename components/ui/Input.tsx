'use client'

import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, useId } from 'react'

// ── Shared label + error wrapper ──────────────────────────────────────────────

/** The ids and aria attributes that tie a field to its label and error. */
export interface FieldA11y {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

interface FieldWrapperProps {
  label?: string
  error?: string
  required?: boolean
  /** The field's own id, if it has one (otherwise one is made up). */
  id?: string
  /** Renders the field, given the attributes that link it to the label and error. */
  children: (a11y: FieldA11y) => React.ReactNode
}

/**
 * Label, field and error message — linked, so screen readers read the label
 * and the error with the field, and tapping the label focuses the field.
 */
export function FieldWrapper({ label, error, required, id, children }: FieldWrapperProps) {
  const autoId = useId()
  const fieldId = id ?? `field-${autoId}`
  const errorId = `${fieldId}-error`
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="font-sans text-base font-semibold text-charcoal">
          {label}
          {required && <span aria-hidden className="text-red-600 mr-1">*</span>}
        </label>
      )}
      {children({
        id: fieldId,
        ...(error ? { 'aria-invalid': true as const, 'aria-describedby': errorId } : {}),
      })}
      {error && (
        <p id={errorId} className="font-sans text-base text-red-600 font-medium">{error}</p>
      )}
    </div>
  )
}

const FIELD_CLASSES = `
  w-full px-4 py-3.5 rounded-xl
  font-sans text-lg text-charcoal
  bg-white border-2 border-slate-300
  focus:outline-none focus:border-walnut focus:ring-2 focus:ring-walnut/20
  transition-colors duration-150
  disabled:bg-parchment disabled:cursor-not-allowed
`

// ── Input ─────────────────────────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, required, className = '', id, ...props }: InputProps) {
  return (
    <FieldWrapper label={label} error={error} required={required} id={id}>
      {a11y => (
        <input
          className={`${FIELD_CLASSES} placeholder:text-slate-400 ${error ? 'border-red-400' : ''} ${className}`}
          required={required}
          {...a11y}
          {...props}
        />
      )}
    </FieldWrapper>
  )
}

// ── Textarea ──────────────────────────────────────────────────────────────────

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, required, className = '', id, ...props }: TextareaProps) {
  return (
    <FieldWrapper label={label} error={error} required={required} id={id}>
      {a11y => (
        <textarea
          className={`${FIELD_CLASSES} placeholder:text-slate-400 resize-none ${error ? 'border-red-400' : ''} ${className}`}
          required={required}
          {...a11y}
          {...props}
        />
      )}
    </FieldWrapper>
  )
}

// ── Select ────────────────────────────────────────────────────────────────────

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export function Select({ label, error, required, className = '', id, children, ...props }: SelectProps) {
  return (
    <FieldWrapper label={label} error={error} required={required} id={id}>
      {a11y => (
        <select
          className={`${FIELD_CLASSES} ${error ? 'border-red-400' : ''} ${className}`}
          required={required}
          {...a11y}
          {...props}
        >
          {children}
        </select>
      )}
    </FieldWrapper>
  )
}
