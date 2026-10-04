import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVisualServer } from './visual-server.mjs';

const calm = { assessable: true, summary: 'Relaxed facial expression.', eyes: 'relaxed', brow: 'relaxed', mouth: 'relaxed', observations: ['Gently closed lids.'], facialTension: 1, scoreRationale: 'All visible facial regions appear relaxed.', reason: '' };
const env = { ALLOWED_ORIGIN: 'https://demo.example', OPENAI_API_KEY: 'test-only-secret', DEMO_ACCESS_TOKEN: 'test-access', OPENAI_MODEL: 'test-model' };
async function withServer(upstream, fn) {
  const server = createVisualServer(env, upstream);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try { await fn(url); } finally { await new Promise(resolve => server.close(resolve)); }
}
const send = (url, overrides = {}) => fetch(`${url}/review`, { method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN, 'Content-Type': 'application/json', 'X-Demo-Token': env.DEMO_ACCESS_TOKEN }, body: JSON.stringify({ image: 'data:image/jpeg;base64,/9j/AA==' }), ...overrides });
const modelResponse = finding => new Response(JSON.stringify({ status: 'completed', model: 'snapshot-test-model', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(finding) }] }] }));

test('authorized review preserves model observations and provenance and disables provider storage', async () => {
  await withServer(async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.input[0].content[1].type, 'input_image');
    return modelResponse(calm);
  }, async url => {
    const response = await send(url);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.finding.facialTension, 1);
    assert.equal(data.rawResponse, JSON.stringify(calm));
    assert.equal(data.modelVersion, 'snapshot-test-model');
    assert.ok(!JSON.stringify(data).includes(env.OPENAI_API_KEY));
  });
});
test('untrusted origins, missing access codes and remote image URLs never reach provider', async () => {
  await withServer(() => { throw new Error('Provider must not be reached'); }, async url => {
    assert.equal((await send(url, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
    assert.equal((await send(url, { headers: { Origin: env.ALLOWED_ORIGIN, 'Content-Type': 'application/json' } })).status, 401);
    assert.equal((await send(url, { body: JSON.stringify({ image: 'https://example.com/infant.jpg' }) })).status, 400);
  });
});
test('contradictory relaxed observations cannot generate high tension', async () => {
  await withServer(() => modelResponse({ ...calm, facialTension: 4 }), async url => {
    const response = await send(url);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).finding, undefined);
  });
});
test('obscured face remains unscored and incomplete provider responses fail closed', async () => {
  await withServer(() => modelResponse({ ...calm, eyes: 'unclear', facialTension: null, reason: 'Eyes obscured.' }), async url => {
    assert.equal((await (await send(url)).json()).finding.facialTension, null);
  });
  await withServer(() => new Response(JSON.stringify({ status: 'incomplete', output: [] })), async url => {
    assert.equal((await send(url)).status, 502);
  });
});
test('provider errors are sanitized and never become a zero pain score', async () => {
  await withServer(() => new Response('sensitive provider text', { status: 500 }), async url => {
    const data = await (await send(url)).json();
    assert.equal(data.finding, undefined);
    assert.ok(!JSON.stringify(data).includes('sensitive provider text'));
  });
});
test('quota exhaustion is distinguished from temporary rate limits without exposing provider text', async () => {
  for (const [code, expected] of [['insufficient_quota', 'provider_quota'], ['rate_limit_exceeded', 'provider_rate_limit']]) {
    await withServer(() => new Response(JSON.stringify({ error: { code, message: 'private upstream detail' } }), { status: 429 }), async url => {
      const response = await send(url);
      assert.equal(response.status, 502);
      const data = await response.json();
      assert.equal(data.errorCode, expected);
      assert.ok(!JSON.stringify(data).includes('private upstream detail'));
      assert.equal(data.finding, undefined);
    });
  }
});
