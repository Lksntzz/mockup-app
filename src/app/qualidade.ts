/** Tamanho físico, em mm, da área onde a arte vale (o quadro menor do padrão de impressão). */
export interface AreaMm {
  largura: number;
  altura: number;
}
export interface Pixels {
  largura: number;
  altura: number;
}
export type Nivel = 'boa' | 'limite' | 'baixa';
export interface LimitesDpi {
  /** A partir daqui a arte é boa. */
  boa: number;
  /** A partir daqui (e abaixo de "boa") está no limite; abaixo é baixa. */
  limite: number;
}

// PROVISÓRIOS: calibrados só com 1 arte aceita (AMETISTA.pdf, ~174 DPI = boa); falta uma arte recusada para o limite de baixo
// nem com a medida real do quadro menor do Corel. Ajustar só aqui.
export const AREA_PADRAO_MM: AreaMm = { largura: 148, altura: 210 };
export const LIMITES_PADRAO: LimitesDpi = { boa: 150, limite: 100 };

const MM_POR_POLEGADA = 25.4;

/**
 * Resolução efetiva (DPI) da arte ao ser ampliada para cobrir a área: o lado que mais aperta decide.
 * (Cobrir significa escalar até preencher os dois lados, então vale o menor DPI dos dois.)
 */
export function avaliarQualidade(
  px: Pixels,
  area: AreaMm = AREA_PADRAO_MM,
  limites: LimitesDpi = LIMITES_PADRAO,
): { dpi: number; nivel: Nivel } {
  if (!(px.largura > 0 && px.altura > 0 && area.largura > 0 && area.altura > 0)) return { dpi: 0, nivel: 'baixa' };
  const dpi = Math.min((px.largura * MM_POR_POLEGADA) / area.largura, (px.altura * MM_POR_POLEGADA) / area.altura);
  // pequena folga para o erro de arredondamento de números decimais (149,9999… conta como 150)
  const nivel: Nivel = dpi >= limites.boa - 1e-6 ? 'boa' : dpi >= limites.limite - 1e-6 ? 'limite' : 'baixa';
  return { dpi, nivel };
}

/** Tamanho mínimo, em pixels, para a arte ficar "boa" naquela área. */
export function pixelsMinimos(area: AreaMm = AREA_PADRAO_MM, limites: LimitesDpi = LIMITES_PADRAO): Pixels {
  return {
    largura: Math.ceil((area.largura * limites.boa) / MM_POR_POLEGADA),
    altura: Math.ceil((area.altura * limites.boa) / MM_POR_POLEGADA),
  };
}

/** Texto pronto para o setor admin pedir uma arte melhor ao cliente. */
export function pedidoDeNovaArte(px: Pixels, area: AreaMm = AREA_PADRAO_MM, limites: LimitesDpi = LIMITES_PADRAO): string {
  const { dpi } = avaliarQualidade(px, area, limites);
  const min = pixelsMinimos(area, limites);
  return (
    `A arte enviada tem ${px.largura} × ${px.altura} pixels (cerca de ${Math.round(dpi)} DPI no tamanho da impressão) ` +
    `e vai ficar serrilhada. Pode nos enviar uma versão em melhor qualidade? ` +
    `O ideal é um arquivo com pelo menos ${min.largura} × ${min.altura} pixels, ou um PDF/arquivo vetorial.`
  );
}

/**
 * Pixels reais da arte recortada, a partir da densidade da imagem dentro do PDF.
 * `arte` é o recorte (em pixels da renderização), `pagina` é a página inteira renderizada e `densidade` diz quantos
 * pixels do arquivo cabem na largura/altura da página inteira. Devolve null se algum número não faz sentido.
 */
export function pixelsNativosDaArte(
  arte: Pixels,
  pagina: Pixels,
  densidade: { pxPorLarguraDaPagina: number; pxPorAlturaDaPagina: number },
): Pixels | null {
  const { pxPorLarguraDaPagina: pw, pxPorAlturaDaPagina: ph } = densidade;
  if (!(pw > 0 && ph > 0 && pagina.largura > 0 && pagina.altura > 0 && arte.largura > 0 && arte.altura > 0)) return null;
  return { largura: Math.round((arte.largura / pagina.largura) * pw), altura: Math.round((arte.altura / pagina.altura) * ph) };
}
