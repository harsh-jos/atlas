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
const { initialFocus, visibleNodeIds, fitCamera, placeLabels } = await import(
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

test('fit camera centres finite visible nodes and fits them inside the available canvas', () => {
  const points = [
    { x: -500, y: -250 },
    { x: 500, y: 250 },
    { x: NaN, y: 0 },
  ];
  const camera = fitCamera(points, 800, 600);
  assert.equal(camera.x, 0);
  assert.equal(camera.y, 0);
  for (const point of points.slice(0, 2)) {
    const x = (point.x - camera.x) * camera.zoom + 400;
    const y = (point.y - camera.y) * camera.zoom + 300;
    assert.ok(x >= 48 && x <= 752);
    assert.ok(y >= 48 && y <= 552);
  }
  assert.equal(fitCamera([], 800, 600), null);
  assert.equal(fitCamera([{ x: 120, y: 90 }], 320, 260).zoom, 4);
});

test('dense label placement respects the budget, viewport, and label collisions', () => {
  const candidates = Array.from({ length: 127 }, (_, index) => ({
    id: String(index),
    x: 100 + (index % 14) * 40,
    y: 70 + Math.floor(index / 14) * 40,
    radius: 4,
    width: 150,
    priority: index,
  }));
  const labels = placeLabels(candidates, candidates, 800, 600, 8);
  assert.ok(labels.length > 0 && labels.length <= 8);
  assert.equal(labels[0].id, '0');
  labels.forEach((label, index) => {
    assert.ok(label.x >= 6 && label.x + label.width <= 794);
    assert.ok(label.y >= 6 && label.y + label.height <= 566);
    for (const other of labels.slice(index + 1)) {
      assert.ok(
        label.x + label.width + 4 <= other.x ||
          other.x + other.width + 4 <= label.x ||
          label.y + label.height + 4 <= other.y ||
          other.y + other.height + 4 <= label.y,
      );
    }
  });
});
