import { it, expect } from 'vitest';
import { readPresentationConnection, savePresentationConnection, clearPresentationConnection, PRESENTATION_CONNECTION_KEY } from './presentationConnection';

it('restores presentation access only after opt-in and removes it when presentation ends', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  const connection = { endpoint: 'https://example.org', token: 'test-only-code', remember: false };
  savePresentationConnection(connection, storage);
  expect(readPresentationConnection(storage).token).toBe('');
  savePresentationConnection({ ...connection, remember: true }, storage);
  expect(readPresentationConnection(storage).token).toBe('test-only-code');
  clearPresentationConnection(storage);
  expect(values.has(PRESENTATION_CONNECTION_KEY)).toBe(false);
});

it('falls back to no credential for corrupt or inaccessible browser storage', () => {
  expect(readPresentationConnection({ getItem: () => '{broken', setItem: () => {}, removeItem: () => {} }).token).toBe('');
  const blocked = { getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); }, removeItem: () => { throw new Error(); } };
  expect(readPresentationConnection(blocked).token).toBe('');
  expect(savePresentationConnection({ endpoint: 'https://example.org', token: 'test-only-code', remember: true }, blocked)).toBe(false);
  expect(() => clearPresentationConnection(blocked)).not.toThrow();
});
