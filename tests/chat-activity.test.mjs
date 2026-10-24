import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function load(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require: (name) => dependencies[name] ?? require(name),
  });
  return exports;
}

const activity = await load('../lib/chat-activity.ts');
const { toolCallsFromEvents } = activity;
const { ChatActivity } = await load('../components/chat/ChatActivity.tsx', {
  '@/lib/chat-activity': activity,
});
const start = (callId, name = 'researcher') => ({ type: 'agent.tool', callId, name });
const finish = (callId, name = 'researcher') => ({ type: 'agent.tool_result', callId, name });
const renderActivity = (events, pending = true) => renderToStaticMarkup(
  createElement(ChatActivity, { events, pending }),
);

test('one invocation changes from a spinner to a tick without duplicating the row', () => {
  const events = [start('a')];
  const running = renderActivity(events);
  const completed = renderActivity([...events, finish('a')]);
  assert.equal((running.match(/<li /g) ?? []).length, 1);
  assert.match(running, /lucide-loader-circle/);
  assert.match(running, /In progress/);
  assert.equal((completed.match(/<li /g) ?? []).length, 1);
  assert.match(completed, /lucide-check/);
  assert.doesNotMatch(completed, /lucide-loader-circle/);
});

test('parallel and repeated calls with the same tool name remain distinct', () => {
  const calls = toolCallsFromEvents([
    start('a'), start('b'), finish('b'), finish('a'), start('c'),
  ]);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].status, 'completed');
  assert.equal(calls[1].status, 'completed');
  assert.equal(calls[2].status, 'running');
});

test('an error without a call ID stays failed when its function response arrives', () => {
  const events = [
    start('a', 'save_explanation'),
    { type: 'agent.tool_error', name: 'save_explanation', message: 'Could not save' },
    finish('a', 'save_explanation'),
  ];
  const calls = toolCallsFromEvents(events);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, 'failed');
  const html = renderActivity(events, false);
  assert.match(html, /lucide-x/);
  assert.match(html, /Could not save/);
  assert.doesNotMatch(html, /lucide-check/);
});

test('events without IDs pair in order and replayed IDs do not add rows', () => {
  assert.equal(toolCallsFromEvents([start(), finish(), start(), finish()]).length, 2);
  const calls = toolCallsFromEvents([start('a'), finish('a'), start('a'), finish('a')]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, 'completed');
});

test('a bounded snapshot can render results even when the start event is missing', () => {
  const calls = toolCallsFromEvents([finish('a'), start('b')]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].status, 'completed');
  assert.equal(calls[1].status, 'running');
});

test('thinking uses only heartbeat text and unfinished calls stop spinning at turn end', () => {
  const thinking = renderActivity([]);
  assert.match(thinking, /thinking-heartbeat/);
  assert.doesNotMatch(thinking, /<svg/);
  assert.equal(renderActivity([], false), '');
  const stopped = renderActivity([start('a')], false);
  assert.match(stopped, /Stopped/);
  assert.doesNotMatch(stopped, /animate-spin|Thinking|lucide-check/);
  const completed = renderActivity([start('a'), finish('a')], false);
  assert.match(completed, /<details[^>]*open/);
  assert.match(completed, /lucide-check/);
});

test('activity stays after the prompt and before a streaming reply, including loaded history', async () => {
  const { ChatPanel } = await load('../components/chat/ChatPanel.tsx', {
    'next/navigation': { useRouter: () => ({}) },
    '@/app/chat/actions': { sendTurn: () => {} },
    '@/components/chat/ChatActivity': { ChatActivity },
    '@/components/chat/ChatMarkdown': { ChatMarkdown: ({ text }) => createElement('p', null, text) },
    '@/components/shadcn/textarea': { Textarea: (props) => createElement('textarea', props) },
    '@/components/shadcn/scroll-area': { ScrollArea: ({ children }) => createElement('div', null, children) },
    '@/components/ui/Button': { Button: ({ children }) => createElement('button', null, children) },
  });
  const html = renderToStaticMarkup(createElement(ChatPanel, {
    sessionId: 'session',
    initialSnapshot: {
      sessionId: 'session',
      messages: [
        { role: 'you', text: 'Previous prompt' },
        { role: 'atlas', text: 'Previous reply' },
        { role: 'you', text: 'Current prompt' },
        { role: 'atlas', text: 'Streaming reply' },
      ],
      latestTurn: {
        id: 'turn', status: 'running', message: 'Current prompt',
        reply: 'Streaming reply', toolErrors: [], error: null,
      },
    },
  }));
  assert.ok(html.lastIndexOf('Previous reply') < html.lastIndexOf('Current prompt'));
  assert.ok(html.lastIndexOf('Current prompt') < html.indexOf('Thinking…'));
  assert.ok(html.indexOf('Thinking…') < html.indexOf('Streaming reply'));
  assert.equal((html.match(/Streaming reply/g) ?? []).length, 1);
});
