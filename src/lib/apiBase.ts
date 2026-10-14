/** Base path for every backend call. Relative so the Vite dev proxy can route it. */
export const API_BASE: string = import.meta.env.VITE_API_BASE || "/api/v1";

/** Absolute-on-origin URL for a backend path, e.g. apiUrl("/studio/bootstrap"). */
export const apiUrl = (path: string): string => `${API_BASE}${path}`;
