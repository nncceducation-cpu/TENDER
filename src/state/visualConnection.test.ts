import { it, expect } from 'vitest';
import { useStore } from './store';

it('keeps the demo credential out of research exports and clears it on session reset', () => {
  useStore.getState().setField('visualConnection', { endpoint: 'https://example.org', token: 'test-only-private-demo-token' });
  useStore.getState().setScreen('trend');
  expect(useStore.getState().visualConnection.token).toBe('test-only-private-demo-token');
  expect(useStore.getState().exportSession()).not.toContain('test-only-private-demo-token');
  expect(useStore.getState().exportSession()).not.toContain('visualConnection');
  useStore.getState().reset();
  expect(useStore.getState().visualConnection.token).toBe('');
});
