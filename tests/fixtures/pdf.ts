import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';

/** Generates real PDFs for tests (no binary fixtures in the repo). */
const LOREM_SR = [
  'Kirhofovi zakoni opisuju odnos struja i napona u električnim kolima.',
  'Prvi zakon kaže da je zbir struja koje ulaze u čvor jednak zbiru struja koje izlaze.',
  'Drugi zakon kaže da je zbir napona u zatvorenoj konturi jednak nuli.',
  'Kondenzator čuva energiju u električnom polju između dve ploče.',
  'Kalem čuva energiju u magnetnom polju koje stvara struja kroz namotaje.',
  'Na ispitu se često traže ekvivalentne otpornosti i Tevenenova teorema.',
];

export async function makePdf(
  options: {
    pages?: number;
    seed?: string;
    paragraphs?: string[];
    pageOverrides?: Record<number, string[]>;
  } = {},
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = options.pages ?? 5;
  const paragraphs = options.paragraphs ?? LOREM_SR;
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Strana ${i + 1} ${options.seed ?? ''}`, { x: 50, y: 790, size: 16, font });
    (options.pageOverrides?.[i] ?? paragraphs).forEach((line, index) => {
      // Helvetica (WinAnsi) can't encode Serbian diacritics; strip them for fixtures.
      const ascii = line
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/đ/g, 'dj')
        .replace(/Đ/g, 'Dj');
      page.drawText(ascii, { x: 50, y: 750 - index * 22, size: 10, font });
    });
  }
  return Buffer.from(await doc.save());
}

export async function makeJavaScriptPdf(): Promise<Buffer> {
  const doc = await PDFDocument.load(await makePdf({ pages: 2 }));
  const action = doc.context.obj({
    Type: 'Action',
    S: 'JavaScript',
    JS: PDFString.of('app.alert("x")'),
  });
  doc.catalog.set(PDFName.of('OpenAction'), doc.context.register(action));
  return Buffer.from(await doc.save());
}

export async function makeLaunchActionPdf(): Promise<Buffer> {
  const doc = await PDFDocument.load(await makePdf({ pages: 2 }));
  const page = doc.getPage(0);
  const action = doc.context.obj({ S: 'Launch', F: PDFString.of('calc.exe') });
  page.node.set(PDFName.of('AA'), doc.context.obj({ O: doc.context.register(action) }));
  return Buffer.from(await doc.save());
}

export async function makeEncryptedPdf(): Promise<Buffer> {
  const mupdf = await import('mupdf');
  const source = mupdf.Document.openDocument(
    await makePdf({ pages: 2 }),
    'application/pdf',
  ).asPDF();
  if (!source) throw new Error('not a pdf');
  return Buffer.from(
    source.saveToBuffer('encrypt=aes-256,user-password=tajna,owner-password=tajna2').asUint8Array(),
  );
}

export function makeNotPdf(): Buffer {
  return Buffer.from('Ovo nije PDF, samo tekst sa ekstenzijom .pdf');
}

/** Paragraphs made of random words: fingerprints unrelated to any other fixture. */
export function uniqueParagraphs(count = 6): string[] {
  const syllables = [
    'ka',
    'ro',
    'mi',
    'te',
    'lo',
    'vu',
    'ne',
    'sa',
    'pi',
    'do',
    'ze',
    'bu',
    'gra',
    'stri',
    'plo',
  ];
  const word = () =>
    Array.from(
      { length: 2 + Math.floor(Math.random() * 3) },
      () => syllables[Math.floor(Math.random() * syllables.length)],
    ).join('');
  return Array.from({ length: count }, () => Array.from({ length: 12 }, word).join(' '));
}

export { LOREM_SR };
