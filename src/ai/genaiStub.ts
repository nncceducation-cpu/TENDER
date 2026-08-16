/**
 * Build-time stub for the standalone single-file build.
 *
 * The cloud assessor is disabled in that build by construction, since it carries
 * no key and sets the public-demo flag. Aliasing the SDK away keeps roughly a
 * hundred kilobytes of unusable code out of an HTML document. Any attempt to
 * reach it fails loudly rather than silently doing nothing.
 */
export class GoogleGenAI {
  constructor() {
    throw new Error(
      'The cloud assessor is not available in the standalone build. Run the full application locally with a key in .env.local.',
    );
  }
}
