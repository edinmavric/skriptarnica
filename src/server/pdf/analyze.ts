import { createHash } from 'node:crypto';

import type * as MupdfModule from 'mupdf';

/**
 * PDF validation and processing (SPEC §4.4, §7.1). Runs in background jobs only, never in
 * a request. Uses mupdf (WASM) for parsing, text and rendering; sharp for WebP previews.
 */

export type PdfRejection =
  'not_pdf' | 'encrypted' | 'javascript' | 'corrupt' | 'empty' | 'too_large';

export const PDF_MAGIC = Buffer.from('%PDF-');

export function hasPdfMagic(head: Buffer): boolean {
  return head.length >= 5 && head.subarray(0, 5).equals(PDF_MAGIC);
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

type Mupdf = typeof MupdfModule;
let mupdfModule: Promise<Mupdf> | null = null;
function loadMupdf(): Promise<Mupdf> {
  mupdfModule ??= import('mupdf');
  return mupdfModule;
}

type PdfObject = ReturnType<InstanceType<Mupdf['PDFDocument']>['getTrailer']>;

const SCRIPT_ACTIONS = new Set(['JavaScript', 'Launch', 'ImportData', 'Rendition']);

/**
 * Looks for executable actions: catalog Names/JavaScript, OpenAction, additional actions
 * (AA) on the catalog, pages, annotations and form fields, and any action dict whose /S is
 * JavaScript/Launch. Bounded traversal so hostile files can't loop us forever.
 */
function containsScript(root: PdfObject, maxNodes = 20_000): boolean {
  const seen = new Set<string>();
  let visited = 0;
  const stack: PdfObject[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as PdfObject;
    visited += 1;
    if (visited > maxNodes) return false;
    let target = node;
    if (node.isIndirect()) {
      const key = node.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      target = node.resolve();
    }
    if (target.isDictionary()) {
      const s = target.get('S');
      if (s.isName() && SCRIPT_ACTIONS.has(s.asName())) return true;
      if (!target.get('JS').isNull()) return true;
      target.forEach((value, key) => {
        if (key === 'JavaScript' && !value.isNull()) stack.push(value);
        // Don't walk content streams, fonts and images: actions never live there.
        if (
          key === 'Parent' ||
          key === 'Contents' ||
          key === 'Resources' ||
          key === 'Font' ||
          key === 'XObject'
        )
          return;
        if (value.isDictionary() || value.isArray() || value.isIndirect()) stack.push(value);
      });
      const names = target.get('Names');
      if (names.isDictionary() && !names.get('JavaScript').isNull()) return true;
    } else if (target.isArray()) {
      for (let i = 0; i < target.length; i += 1) stack.push(target.get(i));
    }
  }
  return false;
}

export interface PdfAnalysis {
  pageCount: number;
  text: string;
  sha256: string;
}

export type AnalyzeResult = { ok: true; value: PdfAnalysis } | { ok: false; reason: PdfRejection };

export async function analyzePdf(buffer: Buffer, maxBytes: number): Promise<AnalyzeResult> {
  if (buffer.length > maxBytes) return { ok: false, reason: 'too_large' };
  if (!hasPdfMagic(buffer)) return { ok: false, reason: 'not_pdf' };
  const mupdf = await loadMupdf();
  let doc: InstanceType<Mupdf['Document']>;
  try {
    doc = mupdf.Document.openDocument(buffer, 'application/pdf');
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  try {
    if (doc.needsPassword()) return { ok: false, reason: 'encrypted' };
    const pdf = doc.asPDF();
    if (!pdf) return { ok: false, reason: 'not_pdf' };
    if (pdf.getTrailer().get('Encrypt').isDictionary()) return { ok: false, reason: 'encrypted' };
    if (containsScript(pdf.getTrailer().get('Root'))) return { ok: false, reason: 'javascript' };
    const pageCount = doc.countPages();
    if (pageCount === 0) return { ok: false, reason: 'empty' };
    const parts: string[] = [];
    for (let i = 0; i < pageCount; i += 1) {
      const page = doc.loadPage(i);
      parts.push(page.toStructuredText('preserve-whitespace').asText());
    }
    const text = parts
      .join('\n\f\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { ok: true, value: { pageCount, text, sha256: sha256(buffer) } };
  } catch {
    return { ok: false, reason: 'corrupt' };
  } finally {
    doc.destroy();
  }
}

/** How many preview pages to render: min(maxPages, ratio × total), at least 1 (SPEC §3.3). */
export function previewPageCount(totalPages: number, maxPages: number, ratio: number): number {
  return Math.max(1, Math.min(maxPages, Math.floor(totalPages * ratio), totalPages));
}

export interface RenderedPreview {
  pageNumber: number;
  webp: Buffer;
  width: number;
  height: number;
  blurred: boolean;
}

/** Renders the first `count` pages to WebP (~1000 px wide); the last one is blurred. */
export async function renderPreviews(
  buffer: Buffer,
  count: number,
  targetWidth = 1000,
): Promise<RenderedPreview[]> {
  const mupdf = await loadMupdf();
  const sharp = (await import('sharp')).default;
  const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
  try {
    const previews: RenderedPreview[] = [];
    for (let i = 0; i < Math.min(count, doc.countPages()); i += 1) {
      const page = doc.loadPage(i);
      const [x0, , x1] = page.getBounds();
      const scale = Math.min(3, targetWidth / Math.max(1, x1 - x0));
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(scale, scale),
        mupdf.ColorSpace.DeviceRGB,
        false,
      );
      const png = Buffer.from(pixmap.asPNG());
      const blurred = i === count - 1;
      let pipeline = sharp(png);
      if (blurred) pipeline = pipeline.blur(14);
      const { data, info } = await pipeline
        .webp({ quality: 72 })
        .toBuffer({ resolveWithObject: true });
      previews.push({
        pageNumber: i + 1,
        webp: data,
        width: info.width,
        height: info.height,
        blurred,
      });
    }
    return previews;
  } finally {
    doc.destroy();
  }
}
