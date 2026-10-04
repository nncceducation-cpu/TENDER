export const PRESENTATION_CONNECTION_KEY = 'tender.presentation.connection';
export interface VisualConnection { endpoint: string; token: string; remember?: boolean }
type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const empty = (): VisualConnection => ({ endpoint: 'https://tender-visual-review.onrender.com', token: '', remember: false });
const browserStorage = (): SessionStorage | undefined => {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { return undefined; }
};
/** Explicit presentation opt-in; never localStorage, never part of research exports. */
export function readPresentationConnection(storage = browserStorage()): VisualConnection {
  try {
    const d = JSON.parse(storage?.getItem(PRESENTATION_CONNECTION_KEY) || 'null');
    if (d?.remember === true && typeof d.endpoint === 'string' && typeof d.token === 'string' && d.token.length <= 512) return { endpoint: d.endpoint, token: d.token, remember: true };
  } catch { /* Browser storage may be unavailable. */ }
  return empty();
}
export function savePresentationConnection(connection: VisualConnection, storage = browserStorage()): boolean {
  try {
    if (!storage) return false;
    if (connection.remember && connection.token) storage.setItem(PRESENTATION_CONNECTION_KEY, JSON.stringify(connection));
    else storage.removeItem(PRESENTATION_CONNECTION_KEY);
    return true;
  } catch { return false; }
}
export function clearPresentationConnection(storage = browserStorage()): void {
  try { storage?.removeItem(PRESENTATION_CONNECTION_KEY); } catch { /* Still clear memory. */ }
}
