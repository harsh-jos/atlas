import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { SourceType } from '@prisma/client';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ['.pdf', '.md', '.markdown', '.html', '.htm', '.txt'] as const;

const EXTENSION_TO_SOURCE_TYPE: Record<string, SourceType> = {
  '.pdf': 'PAPER',
  '.md': 'DOCS',
  '.markdown': 'DOCS',
  '.html': 'WEBSITE',
  '.htm': 'WEBSITE',
  '.txt': 'DOCS',
};

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
}

function stripHtml(html: string): string {
  // Remove scripts and style elements
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

  // Replace block elements with newlines
  text = text.replace(/<\/(div|p|h[1-6]|li|tr|article|section|header|footer|nav)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Strip all remaining tags
  text = text.replace(/<[^>]*>/g, ' ');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

function extractHtmlTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : '';
}

async function extractFromPdf(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({ data });
  const pdf = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: Record<string, unknown>) => (item.str as string) ?? '')
      .filter(Boolean)
      .join(' ');
    pages.push(pageText);
  }

  return pages.join('\n\n');
}

async function extractFromUtf8(buffer: Buffer): Promise<string> {
  return buffer.toString('utf-8');
}

export interface ExtractionResult {
  text: string;
  sourceType: SourceType;
  /** Extracted title from HTML <title> tag, or empty string */
  extractedTitle: string;
}

export async function extractTextFromFile(
  fileBuffer: Buffer,
  fileName: string,
): Promise<ExtractionResult> {
  const ext = getExtension(fileName);

  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error(
      `Unsupported file type "${ext}". Allowed: PDF, Markdown, HTML, TXT`,
    );
  }

  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error('File is too large. Maximum size is 10MB.');
  }

  if (fileBuffer.length === 0) {
    throw new Error('File is empty.');
  }

  const sourceType = EXTENSION_TO_SOURCE_TYPE[ext] ?? 'DOCS';
  let text: string;
  let extractedTitle = '';

  switch (ext) {
    case '.pdf': {
      try {
        text = await extractFromPdf(fileBuffer);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        throw new Error(`Failed to extract text from PDF: ${message}`);
      }
      break;
    }

    case '.md':
    case '.markdown': {
      text = await extractFromUtf8(fileBuffer);
      break;
    }

    case '.html':
    case '.htm': {
      const html = await extractFromUtf8(fileBuffer);
      extractedTitle = extractHtmlTitle(html);
      text = stripHtml(html);
      break;
    }

    case '.txt': {
      text = await extractFromUtf8(fileBuffer);
      break;
    }

    default:
      throw new Error(`Unhandled extension: ${ext}`);
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('No text could be extracted from the file. The file may be a scanned image or contain no readable text.');
  }

  return { text: trimmed, sourceType, extractedTitle };
}
