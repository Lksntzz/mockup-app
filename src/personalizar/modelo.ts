import { ACENTOS, DESLOCA_INICIO } from './acentos';

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

/**
 * A arte base é escolhida pelo operador (PNG ou JPG). As fontes NÃO vão no app nem no GitHub (o repositório e as releases são públicos e as
 * fontes têm licença própria): usa-se as que já estão instaladas no Windows, as mesmas do Corel.
 */
export const EXTENSOES_DA_ARTE = ['.png', '.jpg', '.jpeg'] as const;
export const FONTE_DO_NOME = { familia: 'Cream Candy', alternativas: ['Cream Candy', 'CreamCandy', 'Cream Candy Regular'] } as const;
export const FONTE_DA_INICIAL = { familia: 'Century751 BT', alternativas: ['Century751 BT', 'Century751 BT Roman', 'Century751BT-RomanB'] } as const;

/** O retângulo da arte (a linha preta fina) mede 195 x 255 mm e fica centralizado na A4. */
export const QUADRO_MM = { largura: 195, altura: 255 } as const;

export type FormatoDaArte = 'a4' | 'quadro';

/**
 * A arte pode ser a página A4 inteira (com sangria em volta) ou só o quadro de 195 x 255 mm. Pela proporção da imagem:
 * parecida com a da A4 → página inteira; parecida com a do quadro → o quadro, que é impresso em tamanho real e centralizado.
 * Qualquer outra proporção cai na A4 (nunca deforma por conta própria: a diferença aparece na prévia).
 */
export function formatoDaArte(largPx: number, altPx: number): FormatoDaArte {
  if (!(largPx > 0) || !(altPx > 0)) return 'a4';
  const r = largPx / altPx;
  const a4 = MODELO.paginaMm.largura / MODELO.paginaMm.altura;
  const quadro = QUADRO_MM.largura / QUADRO_MM.altura;
  return Math.abs(r - quadro) / quadro < 0.02 && Math.abs(r - a4) / a4 >= 0.02 ? 'quadro' : 'a4';
}

export const MAX_NOME = 50;
export const MAX_COPIAS = 99;

/** Tira os acentos ("Á" → "A", "ç" → "c"). A letra grande nunca leva acento. */
export function semAcento(t: string): string {
  return t.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

/** Primeira letra do nome, em maiúscula e SEM acento ("ágata" → "A"). Vazio se o nome não tem letra. */
export function inicialDoNome(nome: string): string {
  for (const ch of nome.trim()) {
    if (/\p{L}/u.test(ch)) return semAcento(ch.toLocaleUpperCase('pt-BR'));
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
  const inicial = semAcento(e.inicial.trim());
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

/**
 * Uma letra do nome em HTML. Letra com acento vira a letra sem acento + o acento desenhado por cima (SVG de 1 px sem largura útil, com a base na linha de base do texto):
 * assim a letra pode usar a variação com "onda" da fonte, que não existe acentuada, e o acento sai igual em qualquer posição.
 */
/** Quanto o circunflexo (^) desce, em 1/1000 do tamanho da letra: na fonte ele fica alto e encosta nos enfeites da arte. */
export const DESCE_CIRCUNFLEXO = 50;

export function letraHtml(ch: string, inicio = false): string {
  const acento = ACENTOS[ch];
  if (acento === undefined) return escaparHtml(ch);
  const base = ch.normalize('NFD').charAt(0);
  // na variação de início (ss03, só maiúsculas) o corpo da letra anda para a direita, por causa da onda à esquerda:
  // o quanto anda vem da tabela medida na fonte do designer (DESLOCA_INICIO)
  const dx = inicio ? (DESLOCA_INICIO[base] ?? 0) : 0;
  const dy = ch.normalize('NFD').includes('\u0302') ? DESCE_CIRCUNFLEXO : 0;
  return `<svg class="ac" viewBox="0 0 1000 1000"><path transform="translate(${dx},${1000 + dy}) scale(1,-1)" d="${acento}"/></svg>${escaparHtml(base)}`;
}

/** Largura (unidades de 1/1000 em) de algumas letras na Cream Candy do designer: serve para avisar se a fonte deste computador é outra versão. */
export const LARGURAS_ESPERADAS: Readonly<Record<string, number>> = { a: 297, e: 202, o: 195, A: 561, M: 770, i: 155, l: 242, s: 253 };

export interface RecursosDaPagina {
  /** URL file:// (ou data:) da arte base, já pronta. */
  arteUrl: string;
  /** Padrão 'a4'. */
  formato?: FormatoDaArte;
}

/**
 * HTML da página A4: arte + letra grande (degradê) + nome centralizado.
 * A primeira letra do nome usa a variação de início (ss03) e a última a de fim (ss02): são as linhas ao lado do nome, que vêm da própria fonte. Os acentos são desenhados por cima (letraHtml).
 * Um pequeno script diminui a fonte do nome (e da letra) até caber na largura máxima do modelo e avisa quando terminou (window.__pronto).
 */
export function htmlDaPagina(r: RecursosDaPagina, nome: string, inicial: string, escala = 1): string {
  const chars = [...nome.normalize('NFC')];
  const primeira = letraHtml(chars[0] ?? '', true);
  const meio = chars.slice(1, -1).map((c) => letraHtml(c)).join('');
  const ultima = chars.length > 1 ? letraHtml(chars[chars.length - 1] ?? '') : '';
  const m = MODELO;
  const caixa = r.formato === 'quadro'
    ? { x: (m.paginaMm.largura - QUADRO_MM.largura) / 2, y: (m.paginaMm.altura - QUADRO_MM.altura) / 2, w: QUADRO_MM.largura, h: QUADRO_MM.altura }
    : { x: 0, y: 0, w: m.paginaMm.largura, h: m.paginaMm.altura };
  const css = (u: string) => u.replace(/["\\\n\r]/g, '');
  const locais = (nomes: readonly string[]) => nomes.map((n) => `local("${css(n)}")`).join(',');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"NomeFonte";src:${locais(FONTE_DO_NOME.alternativas)}}
@font-face{font-family:"InicialFonte";src:${locais(FONTE_DA_INICIAL.alternativas)}}
@page{size:${m.paginaMm.largura}mm ${m.paginaMm.altura}mm;margin:0}
html,body{margin:0;padding:0;background:#fff;overflow:hidden}
.pg{transform:scale(${escala});transform-origin:0 0;position:relative;width:${m.paginaMm.largura}mm;height:${m.paginaMm.altura}mm;overflow:hidden;background:url("${css(r.arteUrl)}") ${caixa.x}mm ${caixa.y}mm/${caixa.w}mm ${caixa.h}mm no-repeat}
.ini{position:absolute;left:${m.inicial.centroMm.x}mm;top:${m.inicial.centroMm.y}mm;transform:translate(-50%,-50%);font:${m.inicial.tamanhoPt}pt/1 "InicialFonte";white-space:nowrap;color:transparent;background:radial-gradient(ellipse 50% 50% at 50% 53%,${m.inicial.corCentro} 0%,${m.inicial.corBorda} 100%);-webkit-background-clip:text;background-clip:text}
.nome{position:absolute;left:${m.nome.centroMm.x}mm;top:${m.nome.centroMm.y}mm;transform:translate(-50%,-50%);font:${m.nome.tamanhoPt}pt/1 "NomeFonte";color:${m.nome.cor};white-space:nowrap}
.a{font-feature-settings:"ss03"}.z{font-feature-settings:"ss02"}
.ac{display:inline-block;width:1em;height:1em;margin:-1em -1em 0 0;overflow:visible;vertical-align:baseline}.ac path{fill:currentColor}
.med{position:absolute;left:-99999px;top:0;font-size:1000px;line-height:1;white-space:nowrap;font-family:"NomeFonte"}
</style></head><body><div class="pg"><div class="ini" id="ini">${escaparHtml(inicial)}</div><div class="nome" id="nome"><span class="a">${primeira}</span>${meio}<span class="z">${ultima}</span></div></div>
<script>
(function(){
  var MM=96/25.4*${escala};
  function caber(el,maxMm,minPt){
    var pt=parseFloat(getComputedStyle(el).fontSize)*0.75, max=maxMm*MM, i=0;
    while(el.getBoundingClientRect().width>max+0.5&&pt>minPt&&i++<60){pt=Math.max(minPt,pt*Math.min(0.97,max/el.getBoundingClientRect().width));el.style.fontSize=pt+'pt';}
  }
  function tem(f,nome){return document.fonts.load('40pt '+f).then(function(l){if(!(l.length>0&&l[0].status==='loaded'))falta.push(nome);},function(){falta.push(nome);});}
  var falta=window.__fonteFaltando=[];
  tem('NomeFonte','${FONTE_DO_NOME.familia}').then(function(){return tem('InicialFonte','${FONTE_DA_INICIAL.familia}');}).then(function(){return document.fonts.ready;}).then(function(){
    try{if(!falta.length){
      var med=document.createElement('div');med.className='med';document.body.appendChild(med);
      var larg=function(t){var sp=document.createElement('span');sp.textContent=t;med.appendChild(sp);var w=sp.getBoundingClientRect().width;med.removeChild(sp);return w;};
      var esp=${JSON.stringify(LARGURAS_ESPERADAS)},dif=[],todas=[];
      for(var k in esp){var q=larg(k)/esp[k];todas.push(k+' '+q.toFixed(2));if(Math.abs(q-1)>0.015)dif.push(k);}
      window.__fonteDiferente=dif;window.__largurasFonte=todas.join(', ');
      document.body.removeChild(med);
    }}catch(e){window.__erroMedicao=String(e&&e.message||e);}
    var nomeEl=document.getElementById('nome');
    caber(nomeEl,${m.nome.larguraMaxMm},20);
    caber(document.getElementById('ini'),${m.inicial.larguraMaxMm},60);
    window.__pronto=true;
  }).catch(function(){window.__pronto=true;});
})();
</script></body></html>`;
}
