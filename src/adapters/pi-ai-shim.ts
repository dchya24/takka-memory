/**
 * Local build/test shim mirroring pi's extension-view of `@earendil-works/pi-ai`
 * (see pi-coding-agent `dist/core/extensions/pi-ai-extension-view.js`).
 *
 * At runtime inside pi, imports of `@earendil-works/pi-ai` from extension code are
 * rewritten to the compat view (pi-ai/compat + TypeBox `Type` + TypeBox-based
 * `StringEnum`). Emitted JS keeps the bare `@earendil-works/pi-ai` specifier, so
 * this shim is ONLY used for local `tsc` and `vitest` via `paths`/alias —
 * never shipped or executed inside pi.
 */
import { Type } from "typebox";

export { Type };

export function StringEnum<T extends readonly string[]>(
	values: T,
	options?: { description?: string; default?: T[number] },
) {
	return Type.Unsafe<T[number]>({
		type: "string",
		enum: values,
		...(options?.description && { description: options.description }),
		...(options?.default && { default: options.default }),
	});
}
