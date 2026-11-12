/** Monta um PDF mínimo (1 página) com uma imagem em tons de cinza de largura × altura pixels, posta em `lugar` (pontos PDF). */
export interface Lugar {
  x: number;
  y: number;
  w: number;
  h: number;
}
export function pdfComImagem(pagina: { w: number; h: number }, imagem: { w: number; h: number }, lugar: Lugar): Uint8Array {
  const hex = '80'.repeat(imagem.w * imagem.h) + '>';
  const conteudo = `q ${lugar.w} 0 0 ${lugar.h} ${lugar.x} ${lugar.y} cm /Im0 Do Q`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pagina.w} ${pagina.h}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    `<< /Type /XObject /Subtype /Image /Width ${imagem.w} /Height ${imagem.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${hex.length} >>\nstream\n${hex}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const pos: number[] = [];
  objs.forEach((o, i) => {
    pos.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const p of pos) out += `${String(p).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
