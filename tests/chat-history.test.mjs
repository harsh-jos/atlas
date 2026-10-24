import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';

const sources = await Promise.all(
  ['../lib/api.ts', '../components/layout/ChatHistory.tsx'].map(async (path) => {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    return ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
  }),
);

function history({ provider = 'supabase', signedIn = true } = {}) {
  const requests = [];
  const sessions = [{ sessionId: 'saved-chat', firstMessage: 'Explain tensors' }];
  const cookieJar = new Map();
  if (signedIn && provider === 'local') cookieJar.set('atlas_token', { value: 'local-token' });
  const dependencies = {
    'next/headers': { cookies: async () => cookieJar },
    'next/navigation': { redirect: () => { throw new Error('Unexpected redirect'); } },
    '@/lib/supabase/server': {
      usesSupabase: () => provider === 'supabase',
      supabaseServer: async () => ({ auth: {
        getClaims: async () => ({ data: { claims: signedIn ? { sub: 'user' } : null } }),
        getSession: async () => ({ data: { session: signedIn ? { access_token: 'supabase-token' } : null } }),
      } }),
    },
    'react/jsx-runtime': jsxRuntime,
    './ChatHistoryList': { ChatHistoryList: () => null },
  };
  function load(source) {
    const exports = {};
    runInNewContext(source, {
      exports,
      process: { env: { ATLAS_API_URL: 'https://api.example.test' } },
      require: (name) => {
        assert.ok(name in dependencies, `Unexpected import: ${name}`);
        return dependencies[name];
      },
      fetch: async (url, init) => {
        requests.push({ url, authorization: init.headers.Authorization });
        return { ok: true, status: 200, json: async () => sessions };
      },
    });
    return exports;
  }
  dependencies['@/lib/api'] = load(sources[0]);
  return { ChatHistory: load(sources[1]).ChatHistory, requests, sessions };
}

for (const provider of ['supabase', 'local']) {
  test(`${provider} sign-in shows saved chats with authenticated backend requests`, async () => {
    const { ChatHistory, requests, sessions } = history({ provider });
    const rendered = await ChatHistory();
    assert.equal(rendered.props.sessions, sessions);
    assert.deepEqual(requests, [{
      url: 'https://api.example.test/agent/sessions',
      authorization: `Bearer ${provider}-token`,
    }]);
  });

  test(`${provider} signed-out requests do not fetch private chat history`, async () => {
    const { ChatHistory, requests } = history({ provider, signedIn: false });
    const rendered = await ChatHistory();
    assert.equal(rendered.props.sessions.length, 0);
    assert.equal(requests.length, 0);
  });
}
