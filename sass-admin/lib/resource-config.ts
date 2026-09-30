/**
 * Declarative resource field config. Each `AdminResourcePage` consumer
 * passes a `ResourceFormConfig` describing the columns it wants to
 * create / edit. The form modal in `components/resource-form-modal.tsx`
 * renders these fields and submits the payload as JSON to the resource
 * endpoint. Keeping it as a literal config (not a JSON-Schema parser)
 * means types stay tight and we don't lose IntelliSense per resource.
 *
 * If a field's `name` doesn't exist on the row type, the modal will
 * still POST it — the backend serializer decides what's accepted.
 */

export type FieldType =
  | "text"
  | "email"
  | "url"
  | "password"
  | "number"
  | "textarea"
  | "checkbox"
  | "select"
  | "multiline-readonly";

export type ResourceField = {
  /** JSON key sent to the API. */
  name: string;
  /** Label shown above the input. */
  label: string;
  /** Field type. Default: "text". */
  type?: FieldType;
  /** Required by the form. Backend may still reject — required is UI-level. */
  required?: boolean;
  /** Hint shown beneath the input. */
  helpText?: string;
  /** Placeholder for inputs that accept it. */
  placeholder?: string;
  /** For "select" — option list. */
  options?: { label: string; value: string }[];
  /** When true, the field is shown but disabled (e.g. auto-assigned). */
  readOnly?: boolean;
  /** When true, hide the field entirely in create mode. */
  hideOnCreate?: boolean;
  /** When true, hide the field entirely in edit mode. */
  hideOnEdit?: boolean;
  /** Default value when creating (string-typed; coerced by `type` on submit). */
  defaultValue?: string | number | boolean | null;
};

export type ResourceFormConfig = {
  fields: ResourceField[];
  /** Allow row delete. Default: true. */
  canDelete?: boolean;
  /** Allow row create. Default: true. */
  canCreate?: boolean;
  /** Allow row edit. Default: true. */
  canEdit?: boolean;
  /** Custom label on the + New button. Default: "New {title}". */
  newLabel?: string;
  /** Confirm prompt before delete. Return false to cancel. */
  confirmDelete?: (row: Record<string, unknown>) => string | null;
};

/**
 * Helper: build a payload from the form state. Coerces values by the
 * field's declared type, drops undefined/empty strings unless required.
 * The caller decides whether to PUT or PATCH — this just returns the body.
 */
export function buildPayload(
  state: Record<string, string>,
  config: ResourceFormConfig,
  mode: "create" | "edit",
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const field of config.fields) {
    if (mode === "create" && field.hideOnCreate) continue;
    if (mode === "edit" && field.hideOnEdit) continue;

    const raw = state[field.name];
    const hasValue = raw !== undefined && raw !== null && raw !== "";

    if (!hasValue) {
      if (field.required) {
        // Surface the missing field on the payload anyway so the backend
        // gets a clear "this was required" signal.
        payload[field.name] = null;
      }
      continue;
    }

    switch (field.type) {
      case "number":
        payload[field.name] = Number(raw);
        break;
      case "checkbox":
        payload[field.name] = raw === "true" || raw === "on";
        break;
      default:
        payload[field.name] = raw;
    }
  }

  return payload;
}
