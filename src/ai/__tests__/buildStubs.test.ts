import { describe, it, expect } from 'vitest';
import { GoogleGenAI } from '../genaiStub';
import { InferenceSession, Tensor } from '../onnxStub';

/**
 * The two build-time stubs the standalone single-file build aliases in place of
 * the Gemini SDK and the ONNX runtime.
 *
 * Their entire contract is to fail loudly. That is worth pinning precisely
 * because the alternative - failing silently and returning something
 * empty-but-plausible - is the defect class this whole layer is written against:
 * an absent capability that renders as a reassuring answer. A stub that resolved
 * to a null assessment instead of throwing would put "no pain detected" on a
 * screen in a build where the assessor does not exist.
 */
describe('genaiStub', () => {
  it('throws on construction rather than returning an inert client', () => {
    expect(() => new GoogleGenAI()).toThrow(/not available in the standalone build/);
  });

  it('names the route back to a working assessor', () => {
    expect(() => new GoogleGenAI()).toThrow(/\.env\.local/);
  });
});

describe('onnxStub', () => {
  it('throws when a session is created rather than yielding an empty one', () => {
    expect(() => InferenceSession.create()).toThrow(/not available in the standalone build/);
  });

  it('throws when a tensor is constructed', () => {
    expect(() => new Tensor()).toThrow(/not available in the standalone build/);
  });

  it('names the route back to a working runtime', () => {
    expect(() => InferenceSession.create()).toThrow(/npm run dev/);
  });
});
