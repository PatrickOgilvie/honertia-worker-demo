import { useId, useState } from 'react'
import type { InputHTMLAttributes } from 'react'

interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  readonly label: string
  readonly error?: string
  readonly hint?: string
}

/** Renders a labelled input with consistent help, error, and password states. */
export default function TextField({
  label,
  error,
  hint,
  id: providedId,
  type = 'text',
  'aria-describedby': describedByProp,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const isPassword = type === 'password'
  const [showsPassword, setShowsPassword] = useState(false)

  let describedBy = describedByProp
  if (hint) {
    describedBy = describedBy ? `${describedBy} ${hintId}` : hintId
  }
  if (error) {
    describedBy = describedBy ? `${describedBy} ${errorId}` : errorId
  }

  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="field-control" data-invalid={error ? '' : undefined}>
        <input
          {...inputProps}
          id={id}
          type={isPassword && showsPassword ? 'text' : type}
          className="field-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {isPassword ? (
          <button
            type="button"
            className="password-toggle"
            aria-label={showsPassword ? 'Hide password' : 'Show password'}
            aria-controls={id}
            aria-pressed={showsPassword}
            onClick={() => setShowsPassword((visible) => !visible)}
          >
            {showsPassword ? (
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M3 3l14 14M8.6 8.7a2 2 0 0 0 2.7 2.7M6.2 5.3A8.4 8.4 0 0 1 10 4.4c4.5 0 7.3 4.4 7.3 4.4a10.8 10.8 0 0 1-2.1 2.5M12.8 14a8.7 8.7 0 0 1-2.8.5c-4.5 0-7.3-4.4-7.3-4.4A11.4 11.4 0 0 1 4.8 7.6" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M2.7 10s2.8-4.5 7.3-4.5 7.3 4.5 7.3 4.5-2.8 4.5-7.3 4.5S2.7 10 2.7 10Z" />
                <circle cx="10" cy="10" r="2.2" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field-error" aria-live="polite">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="6.25" />
            <path d="M8 4.8v3.8M8 11.2h.01" />
          </svg>
          {error}
        </p>
      ) : null}
    </div>
  )
}
