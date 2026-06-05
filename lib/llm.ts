const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';

const MAX_INPUT_CHARS = 40_000; // Truncate text to avoid token limits
const TIMEOUT_MS = 60_000;

export interface LLMExtractedEntry {
  title: string;
  summary: string;
  body: string;
  tags: string[];
  metadata: Record<string, unknown>;
  suggestedRelations: Array<{
    targetEntryIndex: number;
    relationType: string;
    note: string;
    rationale: string;
  }>;
}

interface ExistingEntrySummary {
  id: string;
  title: string;
  tags: string[];
}

function callDeepSeek(
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 8000,
    }),
    signal,
  });
}

function cleanLLMResponse(raw: string): string {
  // Strip markdown code fences
  let text = raw.trim();
  if (text.startsWith('```json')) {
    text = text.slice(7);
  } else if (text.startsWith('```')) {
    text = text.slice(3);
  }
  if (text.endsWith('```')) {
    text = text.slice(0, -3);
  }
  return text.trim();
}

function validateShape(data: unknown): LLMExtractedEntry {
  if (!data || typeof data !== 'object') {
    throw new Error('LLM response is not a JSON object');
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.title !== 'string' || !obj.title.trim()) {
    throw new Error('LLM response missing or invalid "title" field');
  }
  if (typeof obj.summary !== 'string') {
    throw new Error('LLM response missing or invalid "summary" field');
  }
  if (typeof obj.body !== 'string') {
    throw new Error('LLM response missing or invalid "body" field');
  }
  if (!Array.isArray(obj.tags)) {
    throw new Error('LLM response missing or invalid "tags" field');
  }
  if (!obj.metadata || typeof obj.metadata !== 'object') {
    throw new Error('LLM response missing or invalid "metadata" field');
  }
  if (!Array.isArray(obj.suggestedRelations)) {
    throw new Error('LLM response missing or invalid "suggestedRelations" field');
  }

  const validRelationTypes = ['PART_OF', 'USES', 'PREREQUISITE', 'CONTRASTS', 'SEE_ALSO'];

  for (const rel of obj.suggestedRelations as Array<Record<string, unknown>>) {
    if (typeof rel.targetEntryIndex !== 'number' || !Number.isInteger(rel.targetEntryIndex)) {
      throw new Error('A suggestedRelation is missing a valid targetEntryIndex');
    }
    if (!validRelationTypes.includes(rel.relationType as string)) {
      throw new Error(
        `Invalid relationType "${String(rel.relationType)}". Must be one of: ${validRelationTypes.join(', ')}`,
      );
    }
  }

  return {
    title: obj.title.trim(),
    summary: obj.summary.trim(),
    body: obj.body.trim(),
    tags: (obj.tags as string[]).map((t) => t.trim().toLowerCase()).filter(Boolean),
    metadata: obj.metadata as Record<string, unknown>,
    suggestedRelations: (obj.suggestedRelations as Array<Record<string, unknown>>).map(
      (r) => ({
        targetEntryIndex: r.targetEntryIndex as number,
        relationType: r.relationType as string,
        note: (r.note as string) ?? '',
        rationale: (r.rationale as string) ?? '',
      }),
    ),
  };
}

export async function extractEntryFromText(
  text: string,
  existingEntries: ExistingEntrySummary[],
): Promise<LLMExtractedEntry> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error(
      'DeepSeek API key not configured. Set DEEPSEEK_API_KEY in your .env file.',
    );
  }

  const truncated = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;

  const existingEntriesJson = JSON.stringify(
    existingEntries.map((e, i) => ({ index: i, id: e.id, title: e.title, tags: e.tags })),
  );

  const systemPrompt = [
    'You are an AI assistant that processes technical content and converts it into structured knowledge base entries.',
    'Given raw text extracted from a document, you will:',
    '',
    '1. Generate a concise, descriptive title (2-8 words)',
    '2. Write a 2-3 sentence summary distilling the core concepts',
    '3. Generate 2-5 relevant tags',
    '4. Reformat the content into clean Markdown with proper headings, paragraphs, code blocks, and lists',
    '5. Extract structured metadata (year, authors, venue, arxiv_id if detectable)',
    '6. Suggest relationships to existing entries in the knowledge base',
    '',
    'Output ONLY valid JSON. Do not include markdown code fences or any text outside the JSON object.',
  ].join('\n');

  const userPrompt = [
    'Extract structured knowledge from this document text:',
    '',
    '--- DOCUMENT TEXT ---',
    truncated,
    '--- END DOCUMENT ---',
    '',
    'Existing knowledge base entries (for relation suggestions):',
    existingEntriesJson,
    '',
    'Respond with JSON in this exact shape:',
    '{',
    '  "title": "string",',
    '  "summary": "string",',
    '  "body": "string (full markdown)",',
    '  "tags": ["string"],',
    '  "metadata": {',
    '    "year": number|null,',
    '    "authors": "string|null",',
    '    "venue": "string|null",',
    '    "arxiv_id": "string|null",',
    '    "url": "string|null"',
    '  },',
    '  "suggestedRelations": [',
    '    {',
    '      "targetEntryIndex": number (index from existing entries array),',
    '      "relationType": "PART_OF|USES|PREREQUISITE|CONTRASTS|SEE_ALSO",',
    '      "note": "string (optional)",',
    '      "rationale": "string (explain why this relation fits)"',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- body must be comprehensive but well-structured Markdown',
    '- Preserve technical depth if the content is a paper',
    '- suggestedRelations: only genuinely relevant connections, not tenuous ones',
    '- If no relations are relevant, return an empty array',
    '- tags should be lowercase, single words or short phrases',
  ].join('\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await callDeepSeek(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      controller.signal,
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `DeepSeek API error (${response.status}): ${errorText.slice(0, 500)}`,
      );
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      throw new Error('DeepSeek API returned an empty response');
    }

    const cleaned = cleanLLMResponse(content);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(
        `Failed to parse LLM response as JSON. Raw response: ${cleaned.slice(0, 500)}`,
      );
    }

    return validateShape(parsed);
  } finally {
    clearTimeout(timeoutId);
  }
}
