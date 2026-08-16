import type { AuditEntry } from '../domain/types';

/**
 * Append-only audit log with a hash chain.
 *
 * v1 wrote the whole patient record, including allergies, medications and past
 * history, into `localStorage` under a fixed key on what is in practice a shared
 * NICU workstation, with no expiry, no clearing and no record of who did what.
 * That is identifiable health information sitting in a browser profile.
 *
 * v2 does the opposite. Nothing identifiable is persisted; the working record
 * lives in memory for the session and is deliberately lost on close. What the
 * audit log holds is the decision trail: which protocol version was in force,
 * which scale was chosen, what the score was, whether a model suggestion was
 * accepted or overridden, and by whom. Each entry hashes the previous one, so a
 * quietly edited export is detectable.
 */

const sha256Hex = async (text: string): Promise<string> => {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const GENESIS_HASH = '0'.repeat(64);

export class AuditLog {
  private entries: AuditEntry[] = [];

  async append(actor: string, action: string, detail: string): Promise<AuditEntry> {
    const prevHash = this.entries.at(-1)?.hash ?? GENESIS_HASH;
    const at = new Date().toISOString();
    const payload = JSON.stringify({ at, actor, action, detail, prevHash });
    const hash = await sha256Hex(payload);
    const entry: AuditEntry = { at, actor, action, detail, prevHash, hash };
    this.entries.push(entry);
    return entry;
  }

  all(): readonly AuditEntry[] {
    return this.entries;
  }

  /** Recompute the chain. Returns the index of the first tampered entry, or -1. */
  async verify(): Promise<number> {
    let prevHash = GENESIS_HASH;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (e.prevHash !== prevHash) return i;
      const expected = await sha256Hex(
        JSON.stringify({ at: e.at, actor: e.actor, action: e.action, detail: e.detail, prevHash }),
      );
      if (expected !== e.hash) return i;
      prevHash = e.hash;
    }
    return -1;
  }

  toJson(): string {
    return JSON.stringify(this.entries, null, 2);
  }
}
