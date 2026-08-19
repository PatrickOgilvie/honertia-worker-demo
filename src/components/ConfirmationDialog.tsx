import { useEffect, useId, useRef } from 'react'
import type { MouseEvent } from 'react'

interface ConfirmationDialogProps {
  readonly open: boolean
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  readonly busyLabel: string
  readonly busy?: boolean
  readonly error?: string
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

/** Presents an interruptible, focus-managed confirmation for destructive work. */
export default function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  busyLabel,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const errorId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
      cancelButtonRef.current?.focus()
      return
    }

    if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (!busy && event.target === event.currentTarget) {
      onCancel()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="confirmation-dialog"
      aria-labelledby={titleId}
      aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onCancel()
      }}
      onClick={handleBackdropClick}
    >
      <div className="confirmation-card">
        <span className="confirmation-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 8v5M12 16.5h.01" />
            <path d="M10.1 3.9 2.8 17a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.9 3.9a2.2 2.2 0 0 0-3.8 0Z" />
          </svg>
        </span>
        <div className="confirmation-copy">
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
          {error ? (
            <p id={errorId} className="confirmation-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="confirmation-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <svg
                className="button-spinner"
                viewBox="0 0 20 20"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="10" cy="10" r="7" />
              </svg>
            ) : null}
            <span aria-live="polite">{busy ? busyLabel : confirmLabel}</span>
          </button>
        </div>
      </div>
    </dialog>
  )
}
