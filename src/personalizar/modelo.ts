/**
 * Modelo "Caderneta de Saúde personalizada": medidas tiradas do arquivo do Corel (A4, em milímetros a partir do topo/esquerda).
 * A arte base e as fontes ficam numa pasta compartilhada escolhida no app (não vão para o GitHub: as fontes têm licença própria).
 */
export const MODELO = {
  paginaMm: { largura: 210, altura: 297 },
  nome: {
    fonte: 'Cream Candy',
    centroMm: { x: 105.07, y: 193.64 },
    tamanhoPt: 87.156,
    larguraMaxMm: 118.65,
    cor: '#9A6738',
  },
  inicial: {
    fonte: 'Century751 BT',
    centroMm: { x: 104.42, y: 133.8 },
    tamanhoPt: 345.55,
    larguraMaxMm: 95,
    /** Degradê radial do Corel: centro quase branco, bordas rosa. */
    corCentro: '#F8EBF3',
    corBorda: '#E5B8BB',
  },
} as const;

/** Arquivos que a pasta do modelo precisa ter (o nome exato não importa, só o trecho e a extensão). */
export const ARQUIVOS_DO_MODELO = [
  { chave: 'arte', rotulo: 'a arte base (PNG ou JPG)', trecho: 'arte', extensoes: ['.png', '.jpg', '.jpeg'] },
  { chave: 'fonteNome', rotulo: 'a fonte do nome (Cream Candy, .otf ou .ttf)', trecho: 'cream', extensoes: ['.otf', '.ttf'] },
  { chave: 'fonteInicial', rotulo: 'a fonte da letra grande (Century751 BT, .ttf ou .otf)', trecho: 'century', extensoes: ['.ttf', '.otf'] },
] as const;

export type ChaveDoArquivo = (typeof ARQUIVOS_DO_MODELO)[number]['chave'];

export const MAX_NOME = 50;
export const MAX_COPIAS = 99;

/** Primeira letra do nome, em maiúscula ("ágata" → "Á"). Vazio se o nome não tem letra. */
export function inicialDoNome(nome: string): string {
  for (const ch of nome.trim()) {
    if (/\p{L}/u.test(ch)) return ch.toLocaleUpperCase('pt-BR');
  }
  return '';
}

export interface EntradaPersonalizar {
  nome: string;
  inicial: string;
  copias: number;
}

export type ValidacaoEntrada = { ok: true; nome: string; inicial: string; copias: number } | { ok: false; motivo: string };

/** Valida o que o operador digitou (usada na tela e de novo no processo principal). */
export function validarEntrada(e: { nome: unknown; inicial: unknown; copias?: unknown }, exigirCopias = false): ValidacaoEntrada {
  if (typeof e.nome !== 'string') return { ok: false, motivo: 'Digite o nome.' };
  const nome = e.nome.replace(/\s+/g, ' ').trim();
  if (nome === '') return { ok: false, motivo: 'Digite o nome.' };
  if ([...nome].length > MAX_NOME) return { ok: false, motivo: `O nome tem mais de ${MAX_NOME} letras.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(nome)) return { ok: false, motivo: 'O nome tem um caractere que não pode ser usado.' };
  if (typeof e.inicial !== 'string') return { ok: false, motivo: 'A letra grande é inválida.' };
  const inicial = e.inicial.trim();
  if (inicial === '') return { ok: false, motivo: 'A letra grande está vazia.' };
  if ([...inicial].length > 2) return { ok: false, motivo: 'A letra grande deve ter 1 ou 2 letras.' };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(inicial)) return { ok: false, motivo: 'A letra grande tem um caractere que não pode ser usado.' };
  let copias = 1;
  if (exigirCopias || e.copias !== undefined) {
    if (typeof e.copias !== 'number' || !Number.isInteger(e.copias) || e.copias < 1 || e.copias > MAX_COPIAS) {
      return { ok: false, motivo: `A quantidade deve ser de 1 a ${MAX_COPIAS}.` };
    }
    copias = e.copias;
  }
  return { ok: true, nome, inicial, copias };
}

export function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface RecursosDaPagina {
  /** URLs file:// (ou data:) já prontas. */
  arteUrl: string;
  fonteNomeUrl: string;
  fonteInicialUrl: string;
}

/**
 * HTML da página A4: arte + letra grande (degradê) + nome centralizado.
 * A primeira letra do nome usa a variação de início (ss03) e a última a de fim (ss02): são as linhas ao lado do nome, que vêm da própria fonte.
 * Um pequeno script diminui a fonte do nome (e da letra) até caber na largura máxima do modelo e avisa quando terminou (window.__pronto).
 */
export function htmlDaPagina(r: RecursosDaPagina, nome: string, inicial: string, escala = 1): string {
  const chars = [...nome];
  const primeira = escaparHtml(chars[0] ?? '');
  const meio = escaparHtml(chars.slice(1, -1).join(''));
  const ultima = chars.length > 1 ? escaparHtml(chars[chars.length - 1] ?? '') : '';
  const m = MODELO;
  const css = (u: string) => u.replace(/["\\\n\r]/g, '');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"NomeFonte";src:url("${css(r.fonteNomeUrl)}")}
@font-face{font-family:"InicialFonte";src:url("${css(r.fonteInicialUrl)}")}
@page{size:${m.paginaMm.largura}mm ${m.paginaMm.altura}mm;margin:0}
html,body{margin:0;padding:0;background:#fff;overflow:hidden}
.pg{transform:scale(${escala});transform-origin:0 0;position:relative;width:${m.paginaMm.largura}mm;height:${m.paginaMm.altura}mm;overflow:hidden;background:url("${css(r.arteUrl)}") 0 0/${m.paginaMm.largura}mm ${m.paginaMm.altura}mm no-repeat}
.ini{position:absolute;left:${m.inicial.centroMm.x}mm;top:${m.inicial.centroMm.y}mm;transform:translate(-50%,-50%);font:${m.inicial.tamanhoPt}pt/1 "InicialFonte";white-space:nowrap;color:transparent;background:radial-gradient(ellipse 50% 50% at 50% 53%,${m.inicial.corCentro} 0%,${m.inicial.corBorda} 100%);-webkit-background-clip:text;background-clip:text}
.nome{position:absolute;left:${m.nome.centroMm.x}mm;top:${m.nome.centroMm.y}mm;transform:translate(-50%,-50%);font:${m.nome.tamanhoPt}pt/1 "NomeFonte";color:${m.nome.cor};white-space:nowrap}
.a{font-feature-settings:"ss03"}.z{font-feature-settings:"ss02"}
</style></head><body><div class="pg"><div class="ini" id="ini">${escaparHtml(inicial)}</div><div class="nome" id="nome"><span class="a">${primeira}</span>${meio}<span class="z">${ultima}</span></div></div>
<script>
(function(){
  var MM=96/25.4*${escala};
  function caber(el,maxMm,minPt){
    var pt=parseFloat(getComputedStyle(el).fontSize)*0.75, max=maxMm*MM, i=0;
    while(el.getBoundingClientRect().width>max+0.5&&pt>minPt&&i++<60){pt=Math.max(minPt,pt*Math.min(0.97,max/el.getBoundingClientRect().width));el.style.fontSize=pt+'pt';}
  }
  document.fonts.load('40pt NomeFonte').then(function(){return document.fonts.load('40pt InicialFonte');}).then(function(){return document.fonts.ready;}).then(function(){
    caber(document.getElementById('nome'),${m.nome.larguraMaxMm},20);
    caber(document.getElementById('ini'),${m.inicial.larguraMaxMm},60);
    window.__pronto=true;
  }).catch(function(){window.__pronto=true;});
})();
</script></body></html>`;
}
