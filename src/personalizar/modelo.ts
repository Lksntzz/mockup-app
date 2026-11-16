import { FONTES_ACENTOS, type AcentosDaFonte } from './acentos';

/** Página A4, em milímetros. Todas as artes são a página A4 inteira (com a linha preta de 195 x 255 mm já desenhada nela). */
export const PAGINA_MM = { largura: 210, altura: 297 } as const;

/**
 * As fontes NÃO vão no app nem no GitHub (o repositório e as releases são públicos e as fontes têm licença própria): usa-se as que já estão
 * instaladas no Windows, as mesmas do Corel. As artes (imagens) vão no app, na pasta assets/artes.
 */
export interface FonteDoTexto { familia: string; alternativas: readonly string[] }
export interface FonteDoNome extends FonteDoTexto {
  /** Chave da tabela de acentos desta fonte (src/personalizar/acentos.ts). */
  acentos: string;
  /** Variação OpenType da primeira letra do nome (linha de início) e da última (linha de fim). */
  inicio: string;
  fim: string;
  /** Largura (em 1/1000 de em) de algumas letras na fonte do designer: serve para avisar se a fonte deste computador é outra versão. */
  largurasEsperadas?: Readonly<Record<string, number>>;
}

export interface ModeloDeArte {
  /** Identificador estável (usado na tela e no processo principal). */
  id: string;
  /** Como aparece na lista do operador. */
  titulo: string;
  /** Arquivos em assets/artes: a arte inteira (A4, 300 dpi) e, se houver, a camada que fica POR CIMA da letra grande (com transparência). */
  arte: string;
  frente?: string;
  fonteNome: FonteDoNome;
  fonteInicial: FonteDoTexto;
  /** A letra grande leva o acento do nome ("Ágata" → Á)? Nas artes em que a fonte da letra grande tem as letras acentuadas. Padrão: não. */
  inicialComAcento?: boolean;
  /** Medidas tiradas do Corel (A4, milímetros a partir do topo/esquerda). */
  nome: { centroMm: { x: number; y: number }; tamanhoPt: number; larguraMaxMm: number; cor: string };
  inicial: { centroMm: { x: number; y: number }; tamanhoPt: number; larguraMaxMm: number; corCentro: string; corBorda: string };
}

const CREAM_CANDY: FonteDoNome = {
  familia: 'Cream Candy',
  alternativas: ['Cream Candy', 'CreamCandy', 'Cream Candy Regular'],
  acentos: 'creamCandy',
  inicio: 'ss03',
  fim: 'ss02',
  largurasEsperadas: { a: 297, e: 202, o: 195, A: 561, M: 770, i: 155, l: 242, s: 253 },
};

const ANGELINA_MALIKA: FonteDoNome = {
  familia: 'Angelina Malika',
  alternativas: ['Angelina Malika', 'AngelinaMalika-Regular', 'Angelina Malika Regular'],
  acentos: 'angelinaMalika',
  inicio: 'ss02',
  fim: 'ss06',
  largurasEsperadas: { a: 511, e: 338, o: 334, A: 1188, M: 979, i: 220, l: 264, s: 291 },
};

/** As artes que o operador escolhe na lista. A primeira é a padrão. */
export const MODELOS: readonly ModeloDeArte[] = [
  {
    id: 'caderneta-saude',
    titulo: 'Caderneta de Saúde',
    arte: 'caderneta-saude.jpg',
    fonteNome: CREAM_CANDY,
    fonteInicial: { familia: 'Century751 BT', alternativas: ['Century751 BT', 'Century751 BT Roman', 'Century751BT-RomanB'] },
    nome: { centroMm: { x: 105.07, y: 193.64 }, tamanhoPt: 87.156, larguraMaxMm: 118.65, cor: '#9A6738' },
    inicial: {
      centroMm: { x: 104.42, y: 133.8 },
      tamanhoPt: 345.55,
      larguraMaxMm: 95,
      /** Degradê radial do Corel: centro quase branco, bordas rosa. */
      corCentro: '#F8EBF3',
      corBorda: '#E5B8BB',
    },
  },
  {
    id: 'delicate',
    titulo: 'Delicate',
    arte: 'delicate.jpg',
    frente: 'delicate-frente.png',
    fonteNome: ANGELINA_MALIKA,
    fonteInicial: { familia: 'Lucida Bright', alternativas: ['Lucida Bright', 'LucidaBright', 'Lucida Bright Regular'] },
    inicialComAcento: true,
    nome: { centroMm: { x: 101.74, y: 186.16 }, tamanhoPt: 34.62, larguraMaxMm: 105, cor: '#CC93AD' },
    inicial: { centroMm: { x: 105, y: 133.68 }, tamanhoPt: 266.287, larguraMaxMm: 75, corCentro: '#CC93AD', corBorda: '#CC93AD' },
  },
];

export const MODELO_PADRAO: ModeloDeArte = MODELOS[0]!;

/** O modelo pelo id; id desconhecido volta ao padrão só se não foi informado nada (id errado é erro: não imprime a arte errada). */
export function modeloPorId(id: unknown): ModeloDeArte | undefined {
  if (id === undefined || id === '') return MODELO_PADRAO;
  return MODELOS.find((m) => m.id === id);
}

export const MAX_NOME = 50;
export const MAX_COPIAS = 99;

/** Tira os acentos ("Á" → "A", "ç" → "c"). A letra grande nunca leva acento. */
export function semAcento(t: string): string {
  return t.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

/** Primeira letra do nome, em maiúscula, sem acento (ou com, se a arte deixa: "ágata" → "Á"). Vazio se o nome não tem letra. */
export function inicialDoNome(nome: string, comAcento = false): string {
  for (const ch of nome.trim()) {
    if (/\p{L}/u.test(ch)) {
      const maiuscula = ch.toLocaleUpperCase('pt-BR');
      return comAcento ? maiuscula.normalize('NFC') : semAcento(maiuscula);
    }
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
export function validarEntrada(e: { nome: unknown; inicial: unknown; copias?: unknown }, exigirCopias = false, comAcento = false): ValidacaoEntrada {
  if (typeof e.nome !== 'string') return { ok: false, motivo: 'Digite o nome.' };
  const nome = e.nome.replace(/\s+/g, ' ').trim();
  if (nome === '') return { ok: false, motivo: 'Digite o nome.' };
  if ([...nome].length > MAX_NOME) return { ok: false, motivo: `O nome tem mais de ${MAX_NOME} letras.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(nome)) return { ok: false, motivo: 'O nome tem um caractere que não pode ser usado.' };
  if (typeof e.inicial !== 'string') return { ok: false, motivo: 'A letra grande é inválida.' };
  const inicial = comAcento ? e.inicial.trim().normalize('NFC') : semAcento(e.inicial.trim());
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

const ACENTOS_PADRAO: AcentosDaFonte = FONTES_ACENTOS.creamCandy!;

/**
 * Uma letra do nome em HTML. Letra com acento vira a letra sem acento + o acento desenhado por cima (SVG com a base na linha de base do texto,
 * do tamanho de 1 em): assim a letra pode usar a variação com "onda" da fonte, que não existe acentuada, e o acento acompanha o tamanho da letra só pelo layout.
 */
export function letraHtml(ch: string, inicio = false, fonte: AcentosDaFonte = ACENTOS_PADRAO): string {
  const acento = fonte.acentos[ch];
  if (acento === undefined) return escaparHtml(ch);
  const dec = ch.normalize('NFD');
  const base = dec.charAt(0);
  // na variação de início o corpo da letra anda para a direita, por causa da linha à esquerda:
  // o quanto anda vem da tabela medida na fonte do designer
  const dx = inicio ? (fonte.inicio[base] ?? 0) : 0;
  const dy = dec.includes('\u0302') ? Math.round((DESCE_CIRCUNFLEXO * fonte.upm) / 1000) : 0;
  const u = fonte.upm;
  // o quadro do desenho tem 2 em de altura (a marca pode passar de 1 em acima da linha de base) e cobre o deslocamento na largura:
  // fora do quadro o navegador não pinta
  const larg = u + dx;
  const em = Math.round((larg / u) * 10000) / 10000;
  const estilo = dx > 0 ? ` style="width:${em}em;margin-right:-${em}em"` : '';
  return `<svg class="ac" viewBox="0 0 ${larg} ${2 * u}"${estilo}><path transform="translate(${dx},${2 * u + dy}) scale(1,-1)" d="${acento}"/></svg>${escaparHtml(base)}`;
}

export interface RecursosDaPagina {
  /** URL file:// (ou data:) da arte, já pronta. */
  arteUrl: string;
  /** Camada com transparência que fica por cima da letra grande (opcional). */
  frenteUrl?: string;
  /** Padrão: a primeira arte da lista. */
  modelo?: ModeloDeArte;
}

/** O miolo do elemento do nome (primeira letra com a variação de início, meio, última com a de fim). Também usado para trocar só o nome numa página já carregada. */
export function nomeHtml(nome: string, modelo: ModeloDeArte = MODELO_PADRAO): string {
  const fonte = FONTES_ACENTOS[modelo.fonteNome.acentos] ?? ACENTOS_PADRAO;
  const chars = [...nome.normalize('NFC')];
  const primeira = letraHtml(chars[0] ?? '', true, fonte);
  const meio = chars.slice(1, -1).map((c) => letraHtml(c, false, fonte)).join('');
  const ultima = chars.length > 1 ? letraHtml(chars[chars.length - 1] ?? '', false, fonte) : '';
  return `<span class="a">${primeira}</span>${meio}<span class="z">${ultima}</span>`;
}

/**
 * HTML da página A4: arte + letra grande + (camada da frente) + nome centralizado.
 * A primeira letra do nome usa a variação de início e a última a de fim: são as linhas ao lado do nome, que vêm da própria fonte. Os acentos são desenhados por cima (letraHtml).
 * Um pequeno script diminui a fonte do nome (e da letra) até caber na largura máxima do modelo e avisa quando terminou (window.__pronto).
 */
export function htmlDaPagina(r: RecursosDaPagina, nome: string, inicial: string, escala = 1): string {
  const mod = r.modelo ?? MODELO_PADRAO;
  const m = { paginaMm: PAGINA_MM, nome: mod.nome, inicial: mod.inicial };
  const css = (u: string) => u.replace(/["\\\n\r]/g, '');
  const locais = (nomes: readonly string[]) => nomes.map((n) => `local("${css(n)}")`).join(',');
  const frente = r.frenteUrl ? `<div class="fr"></div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"NomeFonte";src:${locais(mod.fonteNome.alternativas)}}
@font-face{font-family:"InicialFonte";src:${locais(mod.fonteInicial.alternativas)}}
@page{size:${m.paginaMm.largura}mm ${m.paginaMm.altura}mm;margin:0}
html,body{margin:0;padding:0;background:#fff;overflow:hidden}
.pg{transform:scale(${escala});transform-origin:0 0;position:relative;width:${m.paginaMm.largura}mm;height:${m.paginaMm.altura}mm;overflow:hidden;background:url("${css(r.arteUrl)}") 0 0/100% 100% no-repeat}
.fr{position:absolute;left:0;top:0;width:100%;height:100%;background:url("${css(r.frenteUrl ?? '')}") 0 0/100% 100% no-repeat}
.ini{position:absolute;left:${m.inicial.centroMm.x}mm;top:${m.inicial.centroMm.y}mm;transform:translate(-50%,-50%);font:${m.inicial.tamanhoPt}pt/1 "InicialFonte";white-space:nowrap;color:transparent;background:radial-gradient(ellipse 50% 50% at 50% 53%,${m.inicial.corCentro} 0%,${m.inicial.corBorda} 100%);-webkit-background-clip:text;background-clip:text}
.nome{position:absolute;left:${m.nome.centroMm.x}mm;top:${m.nome.centroMm.y}mm;transform:translate(-50%,-50%);font:${m.nome.tamanhoPt}pt/1 "NomeFonte";color:${m.nome.cor};white-space:nowrap}
.a{font-feature-settings:"${mod.fonteNome.inicio}"}.z{font-feature-settings:"${mod.fonteNome.fim}"}
.ac{display:inline-block;width:1em;height:2em;margin:-2em -1em 0 0;overflow:visible;vertical-align:baseline}.ac path{fill:currentColor}
.med{position:absolute;left:-99999px;top:0;font-size:1000px;line-height:1;white-space:nowrap;font-family:"NomeFonte"}
</style></head><body><div class="pg"><div class="ini" id="ini">${escaparHtml(inicial)}</div>${frente}<div class="nome" id="nome">${nomeHtml(nome, mod)}</div></div>
<script>
(function(){
  var MM=96/25.4*${escala};
  function caber(el,maxMm,minPt){
    var pt=parseFloat(getComputedStyle(el).fontSize)*0.75, max=maxMm*MM, i=0;
    while(el.getBoundingClientRect().width>max+0.5&&pt>minPt&&i++<60){pt=Math.max(minPt,pt*Math.min(0.97,max/el.getBoundingClientRect().width));el.style.fontSize=pt+'pt';}
  }
  function tem(f,nome){return document.fonts.load('40pt '+f).then(function(l){if(!(l.length>0&&l[0].status==='loaded'))falta.push(nome);},function(){falta.push(nome);});}
  var falta=window.__fonteFaltando=[];
  tem('NomeFonte','${css(mod.fonteNome.familia)}').then(function(){return tem('InicialFonte','${css(mod.fonteInicial.familia)}');}).then(function(){return document.fonts.ready;}).then(function(){
    try{if(!falta.length){
      var med=document.createElement('div');med.className='med';document.body.appendChild(med);
      var larg=function(t){var sp=document.createElement('span');sp.textContent=t;med.appendChild(sp);var w=sp.getBoundingClientRect().width;med.removeChild(sp);return w;};
      var esp=${JSON.stringify(mod.fonteNome.largurasEsperadas ?? {})},dif=[],todas=[];
      for(var k in esp){var q=larg(k)/esp[k];todas.push(k+' '+q.toFixed(2));if(Math.abs(q-1)>0.015)dif.push(k);}
      window.__fonteDiferente=dif;window.__largurasFonte=todas.join(', ');
      document.body.removeChild(med);
    }}catch(e){window.__erroMedicao=String(e&&e.message||e);}
    window.__ajustar=function(){
      var nomeEl=document.getElementById('nome'),iniEl=document.getElementById('ini');
      nomeEl.style.fontSize='';iniEl.style.fontSize='';
      caber(nomeEl,${m.nome.larguraMaxMm},20);
      caber(iniEl,${m.inicial.larguraMaxMm},60);
    };
    /* troca só o nome e a letra grande numa página já carregada (a prévia reaproveita a janela: arte e fontes não recarregam) */
    window.__atualizar=function(nomeInterno,ini){
      document.getElementById('nome').innerHTML=nomeInterno;
      document.getElementById('ini').textContent=ini;
      window.__ajustar();
      return new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(function(){r(true);});});});
    };
    window.__ajustar();
    window.__pronto=true;
  }).catch(function(){window.__pronto=true;});
})();
</script></body></html>`;
}
