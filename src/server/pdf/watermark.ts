import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Buyer watermark (SPEC §4.3): footer on every page + a subtle diagonal mark. Lets a leaked
 * copy be traced to its order. Text is transliterated to ASCII because the standard PDF fonts
 * can't encode č/ć/đ/š/ž (and embedding a font per download would bloat every file).
 */
export function toAscii(input: string): string {
  return input
    .replace(/đ/g, 'dj')
    .replace(/Đ/g, 'Dj')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

/** pera.peric@gmail.com → p***@g***.com */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, 1)}***@${host.slice(0, 1)}***${tld}`;
}

export interface WatermarkInfo {
  buyerName: string;
  username: string | null;
  email: string;
  orderId: string;
  date: string;
}

async function loadPdf(buffer: Buffer): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(buffer, { updateMetadata: false });
  } catch {
    // Some valid PDFs use structures pdf-lib can't parse; re-save them with mupdf first.
    const mupdf = await import('mupdf');
    const doc = mupdf.Document.openDocument(buffer, 'application/pdf').asPDF();
    if (!doc) throw new Error('not a PDF');
    const repaired = Buffer.from(doc.saveToBuffer('garbage=compact').asUint8Array());
    return PDFDocument.load(repaired, { updateMetadata: false });
  }
}

export async function watermarkPdf(buffer: Buffer, info: WatermarkInfo): Promise<Buffer> {
  const pdf = await loadPdf(buffer);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const orderShort = info.orderId.slice(-12);
  const who = toAscii(`${info.buyerName}${info.username ? ` (@${info.username})` : ''}`);
  const footer = `Licencirano za: ${who}, ${toAscii(maskEmail(info.email))} | Porudzbina ${orderShort} | ${toAscii(info.date)} | Zabranjeno dalje deljenje`;
  const diagonal = toAscii(`${info.username ?? info.buyerName} ${orderShort}`);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(6, Math.min(8, width / 90));
    const textWidth = font.widthOfTextAtSize(footer, size);
    const footerSize = textWidth > width - 24 ? (size * (width - 24)) / textWidth : size;
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: footerSize * 2.6,
      color: rgb(1, 1, 1),
      opacity: 0.85,
    });
    page.drawText(footer, {
      x: 12,
      y: footerSize * 0.9,
      size: footerSize,
      font,
      color: rgb(0.25, 0.25, 0.3),
    });
    const markSize = Math.min(width, height) / 14;
    const markWidth = font.widthOfTextAtSize(diagonal, markSize);
    page.drawText(diagonal, {
      x: width / 2 - (markWidth / 2) * Math.cos(Math.PI / 4),
      y: height / 2 - (markWidth / 2) * Math.sin(Math.PI / 4),
      size: markSize,
      font,
      color: rgb(0.5, 0.5, 0.55),
      opacity: 0.07,
      rotate: degrees(45),
    });
  }
  pdf.setProducer('Skripta watermark');
  return Buffer.from(await pdf.save({ useObjectStreams: true }));
}
