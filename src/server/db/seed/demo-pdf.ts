import { PDFDocument, StandardFonts } from 'pdf-lib';

/** Generates a plausible multi-page demo PDF (ASCII text; standard fonts lack Serbian glyphs). */
export async function demoPdf(title: string, topics: string[], pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ascii = (text: string) =>
    text.replace(/đ/g, 'dj').replace(/Đ/g, 'Dj').normalize('NFD').replace(/\p{M}/gu, '');
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([595, 842]);
    page.drawText(ascii(title), { x: 50, y: 790, size: 18, font: bold });
    const topic = topics[i % topics.length] ?? '';
    page.drawText(ascii(`${i + 1}. ${topic}`), { x: 50, y: 755, size: 13, font: bold });
    for (let line = 0; line < 22; line += 1) {
      page.drawText(
        ascii(
          `${topic}: primer ${line + 1}, beleska sa predavanja i resenje zadatka sa roka (strana ${i + 1}).`,
        ),
        {
          x: 50,
          y: 725 - line * 26,
          size: 10,
          font,
        },
      );
    }
  }
  return Buffer.from(await doc.save());
}
