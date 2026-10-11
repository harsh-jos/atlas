import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

// Use the existing TypeScript dependency without adding a frontend test loader.
const source = await readFile(
  new URL('../components/graph/graph-model.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { initialFocus, visibleNodeIds } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

const graph = {
  nodes: [
    ['a', 'concept'],
    ['b', 'concept'],
    ['c', 'explanation'],
    ['d', 'concept'],
    ['island', 'concept'],
  ].map(([id, nodeKind]) => ({ id, nodeKind })),
  links: [
    { source: 'a', target: 'b', relationType: 'requires' },
    { source: 'b', target: 'c', relationType: 'explains' },
    { source: 'c', target: 'a', relationType: 'related_to' },
    { source: 'b', target: 'd', relationType: 'requires' },
  ],
};
const kinds = new Set(['concept', 'explanation']);
const relations = new Set(['requires', 'explains', 'related_to']);
const visible = (root, depth, nodeKinds = kinds, edges = relations) => [
  ...visibleNodeIds(graph, root, depth, nodeKinds, edges),
];

test('start at the most connected concept, with safe empty and explanation-only fallbacks', () => {
  assert.equal(initialFocus(graph), 'b');
  assert.equal(initialFocus({ nodes: [], links: [] }), null);
  assert.equal(
    initialFocus({ nodes: [{ id: 'c', nodeKind: 'explanation' }], links: [] }),
    'c',
  );
});

test('expand by one hop in either direction, stop at cycles, and exclude disconnected nodes', () => {
  assert.deepEqual(visible('a', 0), ['a']);
  assert.deepEqual(visible('a', 1), ['a', 'b', 'c']);
  assert.deepEqual(visible('a', 2), ['a', 'b', 'c', 'd']);
  assert.deepEqual(visible('a', 99), ['a', 'b', 'c', 'd']);
  assert.deepEqual(visible('island', 1), ['island']);
});

test('relationship filters constrain traversal; hidden concepts still connect explanations', () => {
  assert.deepEqual(visible('a', 2, kinds, new Set(['explains'])), ['a']);
  assert.deepEqual(visible('a', 2, new Set(['explanation'])), ['c']);
  assert.deepEqual(visible('a', 1, new Set()), []);
});

test('all-nodes view includes isolated nodes; a missing root never invents a visible node', () => {
  assert.deepEqual(visible(null, 1), ['a', 'b', 'c', 'd', 'island']);
  assert.deepEqual(visible('missing', 1), []);
});
