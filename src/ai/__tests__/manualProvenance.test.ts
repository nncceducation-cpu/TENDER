import { describe, expect, it } from 'vitest';
import { useStore } from '../../state/store';

describe('facial proposal provenance', () => {
  it('keeps observed relaxation separate from model estimates and resets provenance', () => {
    const s = useStore.getState();
    s.proposeFacialTension(1, 'clinician');
    expect(useStore.getState().proposedFacialTensionSource).toBe('clinician');
    expect(useStore.getState().proposedFacialTension).toBe(1);
    s.proposeFacialTension(3);
    expect(useStore.getState().proposedFacialTensionSource).toBe('model');
    s.proposeFacialTension(null);
    expect(useStore.getState().proposedFacialTension).toBeNull();
  });
});
