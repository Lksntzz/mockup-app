// Origem: portado de Lksntzz/nisti-identificacao, src/scanner/gtin.js (só validação do GTIN-13).

/** Remove espaços, hífens, quebras de linha e espaço não separável; nada mais. */
export function normalizarEan(v: string): string {
  return String(v ?? '').replace(/[\s\- ]/g, '');
}

export function gtin13CheckDigit(primeiros12: string): number | null {
  const valor = String(primeiros12 ?? '').trim();
  if (!/^\d{12}$/.test(valor)) return null;
  let soma = 0;
  for (let i = 0; i < 12; i += 1) soma += Number(valor[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (soma % 10)) % 10;
}

export function isValidGtin13(v: string): boolean {
  const gtin = String(v ?? '').trim();
  if (!/^\d{13}$/.test(gtin)) return false;
  return gtin13CheckDigit(gtin.slice(0, 12)) === Number(gtin[12]);
}
