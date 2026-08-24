import TextField from '~/components/TextField'
import type { ProjectSummary } from '~/presentation/project'

/** Editable values shared by the create and update project forms. */
export interface ProjectFormValues {
  readonly name: string
  readonly description: string
  readonly visibility: ProjectSummary['visibility']
}

interface ProjectFormFieldsProps {
  readonly data: ProjectFormValues
  readonly errors: Partial<Record<keyof ProjectFormValues, string>>
  readonly disabled: boolean
  readonly onChange: <Field extends keyof ProjectFormValues>(
    field: Field,
    value: ProjectFormValues[Field]
  ) => void
}

function FieldError({ id, message }: { readonly id: string; readonly message?: string }) {
  return message ? (
    <p id={id} className="field-error" aria-live="polite">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 4.8v3.8M8 11.2h.01" />
      </svg>
      {message}
    </p>
  ) : null
}

/** Renders the accessible fields shared by project create and edit journeys. */
export default function ProjectFormFields({
  data,
  errors,
  disabled,
  onChange,
}: ProjectFormFieldsProps) {
  const descriptionHintId = 'project-description-hint'
  const descriptionErrorId = 'project-description-error'
  const visibilityErrorId = 'project-visibility-error'

  return (
    <div className="project-fields">
      <TextField
        id="project-name"
        name="name"
        type="text"
        label="Project name"
        autoComplete="off"
        maxLength={100}
        required
        disabled={disabled}
        value={data.name}
        error={errors.name}
        onChange={(event) => onChange('name', event.target.value)}
      />

      <div className="field">
        <div className="field-label-row">
          <label htmlFor="project-description" className="field-label">
            Description
          </label>
          <span className="character-count" aria-label={`${data.description.length} of 500 characters`}>
            {data.description.length}/500
          </span>
        </div>
        <textarea
          id="project-description"
          name="description"
          rows={5}
          maxLength={500}
          disabled={disabled}
          value={data.description}
          className="field-textarea"
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={
            errors.description
              ? `${descriptionHintId} ${descriptionErrorId}`
              : descriptionHintId
          }
          onChange={(event) => onChange('description', event.target.value)}
        />
        <p id={descriptionHintId} className="field-hint">
          A short explanation of what this project demonstrates.
        </p>
        <FieldError id={descriptionErrorId} message={errors.description} />
      </div>

      <fieldset
        className="visibility-fieldset"
        disabled={disabled}
        aria-invalid={errors.visibility ? true : undefined}
        aria-describedby={errors.visibility ? visibilityErrorId : undefined}
      >
        <legend className="field-label">Visibility</legend>
        <div className="visibility-options">
          <label className="visibility-option">
            <input
              type="radio"
              name="visibility"
              value="private"
              checked={data.visibility === 'private'}
              aria-invalid={errors.visibility ? true : undefined}
              onChange={() => onChange('visibility', 'private')}
            />
            <span className="visibility-control" aria-hidden="true" />
            <span>
              <strong>Private</strong>
              <small>Only the signed-in owner can view it.</small>
            </span>
          </label>
          <label className="visibility-option">
            <input
              type="radio"
              name="visibility"
              value="public"
              checked={data.visibility === 'public'}
              aria-invalid={errors.visibility ? true : undefined}
              onChange={() => onChange('visibility', 'public')}
            />
            <span className="visibility-control" aria-hidden="true" />
            <span>
              <strong>Public</strong>
              <small>Anyone with the showcase link can view it.</small>
            </span>
          </label>
        </div>
        <FieldError id={visibilityErrorId} message={errors.visibility} />
      </fieldset>
    </div>
  )
}
