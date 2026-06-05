import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { extractTextFromFile } from '@/lib/file-ingestion';
import { extractEntryFromText } from '@/lib/llm';

export const maxDuration = 60; // seconds

const MAX_RELATION_CANDIDATES = 50;

export async function POST(request: Request) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Request must be multipart/form-data with a file field.' },
        { status: 400 },
      );
    }

    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided. Use the "file" field.' },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'The uploaded file is empty.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Step 1: Extract text from the file
    let extraction: Awaited<ReturnType<typeof extractTextFromFile>>;
    try {
      extraction = await extractTextFromFile(fileBuffer, file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to extract text';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Step 2: Fetch existing entries for relation suggestions
    const existingEntries = await db.entry.findMany({
      select: { id: true, title: true, tags: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_RELATION_CANDIDATES,
    });

    // Step 3: Call LLM to extract structured content
    let extracted: Awaited<ReturnType<typeof extractEntryFromText>>;
    try {
      extracted = await extractEntryFromText(extraction.text, existingEntries);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LLM extraction failed';
      console.error('LLM extraction error:', message);
      return NextResponse.json(
        { error: `AI analysis failed: ${message}` },
        { status: 500 },
      );
    }

    // Step 4: Resolve targetEntryIndex → targetEntryId for the client
    const suggestedRelations = extracted.suggestedRelations
      .filter((rel) => {
        const idx = rel.targetEntryIndex;
        return idx >= 0 && idx < existingEntries.length;
      })
      .map((rel) => {
        const entry = existingEntries[rel.targetEntryIndex]!;
        return {
          candidateId: entry.id,
          candidateTitle: entry.title,
          relationType: rel.relationType,
          note: rel.note,
          rationale: rel.rationale,
          approved: true, // default to approved, user can uncheck
        };
      });

    const preview = {
      title: extracted.title,
      summary: extracted.summary,
      body: extracted.body,
      tags: extracted.tags,
      metadata: extracted.metadata,
      suggestedRelations,
    };

    return NextResponse.json({
      extractedText: extraction.text.slice(0, 500),
      sourceType: extraction.sourceType,
      extractedTitle: extraction.extractedTitle,
      preview,
    });
  } catch (error) {
    console.error('Ingestion error:', error);
    return NextResponse.json(
      { error: 'Internal server error during ingestion.' },
      { status: 500 },
    );
  }
}
