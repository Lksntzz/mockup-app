/** Regra do SKU que o NISTI aceita: MIOLO_CAPA_ACABAMENTO, com o acabamento em 3 letras (wire-o, tassel, elástico). */
const WIREO = 'PBR';
const ACESSORIO = 'PBARVL';
export const EXEMPLO_DE_SKU = 'AG27_ROSA_PXA';

/** Devolve o motivo em português se o NISTI recusaria este SKU; undefined se está no formato certo. */
export function motivoDoSkuInvalido(sku: string): string | undefined {
  const partes = sku.trim().toUpperCase().split('_');
  if (partes.length !== 3 || !partes[0] || !partes[1]) return 'precisa ter 3 partes separadas por _ (MIOLO_CAPA_ACABAMENTO)';
  const a = partes[2]!;
  if (a.length !== 3) return 'o acabamento (3ª parte) precisa ter 3 letras: wire-o, tassel e elástico';
  if (!WIREO.includes(a[0]!)) return `wire-o "${a[0]}" desconhecido (use P, B ou R)`;
  if (a[1] !== 'X' && !ACESSORIO.includes(a[1]!)) return `tassel "${a[1]}" desconhecido (use P, B, A, R, V, L ou X para sem tassel)`;
  if (a[2] !== 'X' && !ACESSORIO.includes(a[2]!)) return `elástico "${a[2]}" desconhecido (use P, B, A, R, V, L ou X para sem elástico)`;
  return undefined;
}
