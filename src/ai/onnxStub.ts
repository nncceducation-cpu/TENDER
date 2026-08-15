/**
 * Build-time stub for the standalone single-file build.
 *
 * The ONNX slot exists for a model a unit trains on its own data, which is not
 * something anyone does from a file:// page. Aliasing the runtime away here keeps
 * a 27 MB WASM binary out of an HTML document. Any attempt to use it fails loudly.
 */
const unavailable = () => {
  throw new Error(
    'The ONNX inference slot is not available in the standalone build. Run the full application with npm run dev.',
  );
};

export const InferenceSession = { create: unavailable };
export class Tensor {
  constructor() {
    unavailable();
  }
}
