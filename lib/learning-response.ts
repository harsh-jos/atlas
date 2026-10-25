export type LearningVisual = {
  type:
    | 'diagram'
    | 'stepper'
    | 'worked-example'
    | 'compare'
    | 'plot'
    | 'image'
    | 'details';
  title: string;
  fallback: string;
  nodes?: { id: string; label: string; detail?: string }[];
  edges?: { source: string; target: string; label?: string }[];
  steps?: { title: string; body: string; code?: string }[];
  columns?: string[];
  rows?: { label: string; cells: string[] }[];
  coefficients?: number[];
  xMin?: number;
  xMax?: number;
  initialX?: number;
  xLabel?: string;
  yLabel?: string;
  assetId?: string;
  alt?: string;
  caption?: string;
  body?: string;
};
export type LearningBlock =
  | { id: string; type: 'markdown'; text: string }
  | { id: string; type: 'component'; component: LearningVisual };
export interface LearningDocument {
  schemaVersion: 1;
  blocks: LearningBlock[];
  fallbackText: string;
}

const string = (v: unknown, max = 4000): v is string =>
  typeof v === 'string' && v.length <= max;
const list = (v: unknown, max: number): v is unknown[] =>
  Array.isArray(v) && v.length > 0 && v.length <= max;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
/** Validate untrusted streamed syntax before handing it to native components. No code evaluation. */
export function validVisual(v: unknown): v is LearningVisual {
  if (!record(v) || !string(v.title, 200) || !string(v.fallback)) return false;
  switch (v.type) {
    case 'diagram': {
      if (
        !list(v.nodes, 16) ||
        !v.nodes.every(
          (n) =>
            record(n) &&
            string(n.id, 40) &&
            /^[\w-]+$/.test(n.id) &&
            string(n.label, 100) &&
            (n.detail === undefined || string(n.detail, 1500)),
        )
      )
        return false;
      const ids = new Set(v.nodes.map((n) => (n as { id: string }).id));
      return (
        ids.size === v.nodes.length &&
        Array.isArray(v.edges) &&
        v.edges.length <= 32 &&
        v.edges.every(
          (e) =>
            record(e) &&
            typeof e.source === 'string' &&
            typeof e.target === 'string' &&
            e.source !== e.target &&
            ids.has(e.source) &&
            ids.has(e.target) &&
            (e.label === undefined || string(e.label, 100)),
        )
      );
    }
    case 'stepper':
    case 'worked-example':
      return (
        list(v.steps, 12) &&
        v.steps.every(
          (s) =>
            record(s) &&
            string(s.title, 200) &&
            string(s.body, 3000) &&
            (s.code === undefined || string(s.code, 3000)),
        )
      );
    case 'compare':
      return (
        list(v.columns, 4) &&
        v.columns.length >= 2 &&
        v.columns.every((c) => string(c, 200)) &&
        list(v.rows, 12) &&
        v.rows.every(
          (r) =>
            record(r) &&
            string(r.label, 200) &&
            Array.isArray(r.cells) &&
            r.cells.length === (v.columns as unknown[]).length &&
            r.cells.every((c) => string(c, 2000)),
        )
      );
    case 'plot':
      return (
        list(v.coefficients, 7) &&
        v.coefficients.every(
          (c) =>
            typeof c === 'number' && Number.isFinite(c) && Math.abs(c) <= 1e8,
        ) &&
        typeof v.xMin === 'number' &&
        typeof v.xMax === 'number' &&
        Number.isFinite(v.xMin) &&
        Number.isFinite(v.xMax) &&
        v.xMin >= -10000 &&
        v.xMax <= 10000 &&
        v.xMin < v.xMax &&
        (v.initialX === undefined ||
          (typeof v.initialX === 'number' && Number.isFinite(v.initialX)))
      );
    case 'image':
      return (
        typeof v.assetId === 'string' &&
        /^[0-9a-f-]{36}$/i.test(v.assetId) &&
        string(v.alt, 2000) &&
        (v.caption === undefined || string(v.caption, 2000))
      );
    case 'details':
      return string(v.body, 12000);
    default:
      return false;
  }
}

export function visualText(v: LearningVisual): string {
  return [
    v.title,
    v.fallback,
    ...(v.nodes ?? []).map(
      (n) => `${n.label}${n.detail ? `: ${n.detail}` : ''}`,
    ),
    ...(v.steps ?? []).flatMap((s) => [s.title, s.body, s.code ?? '']),
    ...(v.columns ? [v.columns.join(' | ')] : []),
    ...(v.rows ?? []).map((r) => `${r.label}: ${r.cells.join(' | ')}`),
    v.body,
    v.alt,
    v.caption,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function parseLearningResponse(text: string): LearningDocument {
  const blocks: LearningBlock[] = [];
  const pattern = /^```atlas[^\n]*\n([\s\S]*?)^```\s*$/gm;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > cursor)
      blocks.push({
        id: '',
        type: 'markdown',
        text: text.slice(cursor, match.index),
      });
    let value: unknown;
    try {
      value = match[1].length <= 24000 ? JSON.parse(match[1]) : null;
    } catch {
      value = null;
    }
    if (blocks.length < 41 && validVisual(value))
      blocks.push({ id: '', type: 'component', component: value });
    else
      blocks.push({
        id: '',
        type: 'markdown',
        text:
          record(value) && string(value.fallback) && value.fallback
            ? value.fallback
            : 'This visual could not be displayed.',
      });
    cursor = match.index! + match[0].length;
  }
  const tail = text.slice(cursor).split(/^```atlas[^\n]*(?:\n|$)/m)[0];
  if (tail.trim()) blocks.push({ id: '', type: 'markdown', text: tail });
  blocks.forEach((b, i) => {
    b.id = `b${i}`;
  });
  return {
    schemaVersion: 1,
    blocks,
    fallbackText: blocks
      .map((b) => (b.type === 'markdown' ? b.text : visualText(b.component)))
      .join('\n\n'),
  };
}

export function askAbout(passage: string) {
  const prompt = `Help me understand this specific part of the explanation:\n\n${passage.slice(0, 4000)}`;
  const event = new CustomEvent('atlas:ask-about', {
    detail: prompt,
    cancelable: true,
  });
  if (window.dispatchEvent(event))
    window.location.assign(`/chat?question=${encodeURIComponent(prompt)}`);
}
