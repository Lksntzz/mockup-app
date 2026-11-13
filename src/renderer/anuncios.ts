import { aplicarPar, aplicarPdf, definirVariacao, formVazio, validar, type FormAnuncio } from '../app/anuncios-form';
import { caminhoPrevisto, ehArteAceita, limparArte, removerPar, ehPdf, montarEntrada, textoDaEtapaCorel } from '../app/anuncios-ui';
import { aplicarProgresso, fecharPassosPendentes, passosIniciais, svgParaDataUri, tituloFinal, type Passo } from '../app/anuncios-passos';
import { openPdf } from '../pdf/reader';
import type { MockupApi } from './global';

const api: MockupApi = (window as unknown as { mockupApi: MockupApi }).mockupApi;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const NOVA = '__nova__';

let form: FormAnuncio = formVazio();
let iniciado = false;
let semPasta = true;
let rodando = false;
let lendo = false;
let seqCategorias = 0;
let existente: string | undefined;
let ultimaCategoria = '';
let pastaAnuncios: string | undefined;
/** Pasta do anúncio que acabou de ser criada (para o botão "Montar no Corel agora"). */
let pastaCriada: string | undefined;
let passos: Passo[] = [];

const ICONES: Record<Passo['estado'], string> = { espera: '', andamento: '', feito: '✓', pulado: '', erro: '✗' };

function desenharPassos(): void {
  const ul = $('an-passos-lista');
  ul.replaceChildren();
  for (const p of passos) {
    const li = document.createElement('li');
    li.className = p.estado;
    const ic = document.createElement('span');
    ic.className = 'an-passo-icone';
    ic.textContent = ICONES[p.estado];
    const tx = document.createElement('span');
    tx.textContent = p.estado === 'pulado' ? `${p.rotulo} (pulado)` : p.rotulo;
    li.append(ic, tx);
    ul.append(li);
  }
}

/** Mostra a lista de passos e ouve o progresso só durante a chamada; devolve quem desliga o ouvinte. */
function comecarPassos(apenasCorel: boolean): () => void {
  passos = apenasCorel ? passosIniciais().filter((p) => p.etapa === 'corel') : passosIniciais();
  $('an-resultado').hidden = true;
  $('an-passos').hidden = false;
  desenharPassos();
  return api.aoProgredirAnuncio((p) => {
    passos = aplicarProgresso(passos, p.etapa, p.estado);
    desenharPassos();
  });
}

function texto(el: HTMLElement, t: string): void {
  el.textContent = t;
  el.hidden = !t;
}
function erroDe(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Algo deu errado. Tente de novo.';
}
function mensagem(t: string, erro = true): void {
  const el = $('an-msg');
  texto(el, t);
  el.classList.toggle('an-erro', erro);
  el.setAttribute('role', erro ? 'alert' : 'status');
}

function preencher(sel: HTMLSelectElement, itens: string[], escolhido: string, extra?: string): void {
  sel.replaceChildren();
  const vazio = document.createElement('option');
  vazio.value = '';
  vazio.textContent = 'Escolha…';
  sel.append(vazio);
  for (const i of itens) {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = i;
    sel.append(o);
  }
  if (extra) {
    const o = document.createElement('option');
    o.value = NOVA;
    o.textContent = extra;
    sel.append(o);
  }
  sel.value = itens.includes(escolhido) ? escolhido : '';
}

/** Atualiza só mensagens e botões (não recria os campos, para não perder o foco). */
function atualizar(): void {
  const v = validar(form);
  texto($('an-erro-arte'), v.erros.arte ?? '');
  texto($('an-erro-titulo'), v.erros.titulo ?? '');
  texto($('an-geral'), form.origem === 'nenhuma' ? '' : v.erros.geral ?? '');
  $('an-linhas').querySelectorAll<HTMLElement>('.an-linha').forEach((linha, i) => {
    const e = v.erros.ean[i] ?? '';
    texto(linha.querySelector<HTMLElement>('.an-erro')!, e);
    // EAN vazio não é erro: só uma dica neutra (vale para "Só criar a pasta e o .txt")
    texto(linha.querySelector<HTMLElement>('.an-pendente')!, e ? '' : v.pendentes[i] ?? '');
    linha.querySelector('.an-ean')!.classList.toggle('invalido', Boolean(e));
  });
  texto($('an-caminho'), caminhoPrevisto(form, pastaAnuncios));
  const lista = $('an-avisos-form');
  lista.replaceChildren();
  for (const a of v.avisos) {
    const li = document.createElement('li');
    li.textContent = a;
    lista.append(li);
  }
  const livre = !semPasta && !rodando && !lendo;
  $<HTMLButtonElement>('an-criar').disabled = !(v.podeCriar && livre);
  $<HTMLButtonElement>('an-so-pasta').disabled = !(v.podeCriarSoPasta && livre);
  $<HTMLButtonElement>('an-montar-agora').disabled = !livre || !pastaCriada;
  $<HTMLButtonElement>('an-mais').hidden = form.origem !== 'imagens';
  $<HTMLButtonElement>('an-mais').disabled = semPasta || rodando || lendo;
  $<HTMLButtonElement>('an-limpar').hidden = form.origem === 'nenhuma';
}

function nomeDoArquivo(c: string | undefined): string {
  return c ? (c.split(/[\\/]/).pop() ?? c) : '(falta)';
}

function descreverFonte(i: number): string {
  const f = form.fontes[i];
  if (!f) return '';
  if (f.tipo === 'pdf') return `PDF, páginas ${f.paginaCapa}${f.paginaContra ? ` e ${f.paginaContra}` : ''}`;
  return `Capa: ${nomeDoArquivo(f.capa)} · Contra capa: ${f.contra ? nomeDoArquivo(f.contra) : '(nenhuma)'}`;
}

/** Recria as linhas (só quando o número de capas muda). */
function desenharLinhas(): void {
  const alvo = $('an-linhas');
  alvo.replaceChildren();
  form.variacoes.forEach((v, i) => {
    const linha = document.createElement('div');
    linha.className = 'an-linha';
    const campos: Array<['capa' | 'sku' | 'ean', string, string]> = [['capa', 'Capa', ''], ['sku', 'SKU', ''], ['ean', 'EAN (13 dígitos)', ' an-ean']];
    for (const [campo, rotulo, cls] of campos) {
      const l = document.createElement('label');
      l.append(rotulo);
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = v[campo];
      if (cls) inp.className = cls.trim();
      inp.addEventListener('input', () => {
        form = definirVariacao(form, i, campo, inp.value);
        atualizar();
      });
      l.append(inp);
      if (campo === 'ean') {
        const e = document.createElement('span');
        e.className = 'an-erro';
        e.hidden = true;
        l.append(e);
        const p = document.createElement('span');
        p.className = 'an-pendente';
        p.hidden = true;
        l.append(p);
      }
      linha.append(l);
    }
    const arqs = document.createElement('div');
    arqs.className = 'an-arqs';
    arqs.textContent = descreverFonte(i);
    linha.append(arqs);
    if (form.origem === 'imagens') {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'discreto';
      rm.textContent = 'Remover este par';
      rm.addEventListener('click', () => {
        if (rodando || lendo) return;
        form = removerPar(form, i);
        desenharLinhas();
      });
      linha.append(rm);
    }
    alvo.append(linha);
  });
  // o erro do EAN fica dentro do label do EAN; atualizar() procura '.an-erro' da linha
  atualizar();
}

function numerarCapas(): void {
  form = { ...form, variacoes: form.variacoes.map((v, i) => (v.capa ? v : { ...v, capa: `Capa ${i + 1}` })) };
}

async function receberArquivos(arquivos: File[]): Promise<void> {
  if (rodando || lendo) { mensagem('Espere terminar o que está em andamento para trocar a arte.'); return; }
  mensagem('');
  const validos: string[] = [];
  for (const a of arquivos) {
    const caminho = api.caminhoDoArquivo(a);
    if (!caminho || !ehArteAceita(caminho)) {
      mensagem(`"${a.name}" não é PDF, PNG ou JPG. Escolha outro arquivo.`);
      return;
    }
    validos.push(caminho);
  }
  if (!validos.length) return;
  const pdf = validos.find(ehPdf);
  let leu = false;
  try {
    if (pdf) {
      if (validos.length > 1) { mensagem('Solte só um PDF, ou então só imagens (PNG, JPG).'); return; }
      mensagem('Lendo o PDF…', false);
      lendo = true;
      atualizar();
      let total: number;
      try {
        const doc = await openPdf((await api.lerPdf(pdf)).bytes);
        total = doc.pageCount;
        await doc.close().catch(() => undefined);
      } finally {
        lendo = false;
      }
      if (!Number.isInteger(total) || total < 1) { mensagem('Não consegui ler as páginas desse PDF.'); return; }
      form = aplicarPdf(form, pdf, total);
      mensagem('');
    } else {
      // imagens: preenche o primeiro par incompleto; senão começa outro par
      let resto = [...validos];
      while (resto.length) {
        const incompleto = form.origem === 'imagens' ? form.fontes.findIndex((f) => f.tipo === 'imagem' && !f.contra) : -1;
        if (incompleto >= 0 && form.fontes[incompleto]?.tipo === 'imagem' && (form.fontes[incompleto] as { capa: string }).capa) {
          form = aplicarPar(form, incompleto, { contra: resto.shift() });
        } else if (incompleto >= 0 && !(form.fontes[incompleto] as { capa: string }).capa) {
          form = aplicarPar(form, incompleto, { capa: resto.shift() });
        } else {
          const capa = resto.shift();
          const contra = resto.shift();
          form = aplicarPar(form, form.origem === 'imagens' ? form.fontes.length : 0, { capa, ...(contra ? { contra } : {}) });
        }
      }
    }
    leu = true;
  } catch (e) {
    mensagem(erroDe(e));
  } finally {
    // em toda saída (PDF estragado, sem páginas, erro) os botões voltam a refletir o formulário
    if (!leu) atualizar();
  }
  if (!leu) return;
  numerarCapas();
  $<HTMLInputElement>('an-arte').value = form.arte;
  $<HTMLInputElement>('an-titulo').value = form.titulo;
  texto($('an-fontes'), form.origem === 'pdf' ? `PDF escolhido: ${nomeDoArquivo((form.fontes[0] as { arquivo?: string } | undefined)?.arquivo)}` : '');
  desenharLinhas();
}

function adicionarMais(): void {
  if (form.origem !== 'imagens') return;
  $<HTMLInputElement>('an-arquivos').click();
}

async function carregarCategorias(escolhida = ''): Promise<void> {
  const sel = $<HTMLSelectElement>('an-categoria');
  if (!form.plataforma) { seqCategorias++; preencher(sel, [], '', 'Nova categoria…'); sel.disabled = true; return; }
  sel.disabled = false;
  const pedida = form.plataforma;
  const meu = ++seqCategorias;
  const cats = await api.anunciosCategorias(pedida).catch(() => [] as string[]);
  if (meu !== seqCategorias || form.plataforma !== pedida) return;
  preencher(sel, cats, escolhida, 'Nova categoria…');
  form = { ...form, categoria: sel.value };
  ultimaCategoria = sel.value;
}

export async function mostrarAnuncios(): Promise<void> {
  try {
    const r = await api.anunciosPastas();
    semPasta = !r.pastaAnuncios;
    pastaAnuncios = r.pastaAnuncios;
    const aviso = [semPasta ? 'Escolha a pasta Anúncio 2027 na Configuração' : '', ...(r.avisos ?? [])].filter(Boolean).join(' ');
    texto($('an-aviso'), aviso);
    const sel = $<HTMLSelectElement>('an-plataforma');
    preencher(sel, r.plataformas, form.plataforma);
    form = { ...form, plataforma: sel.value };
    for (const id of ['an-plataforma', 'an-categoria', 'an-arte', 'an-titulo', 'an-arquivos']) $<HTMLInputElement>(id).disabled = semPasta;
    await carregarCategorias(form.categoria);
    $<HTMLInputElement>('an-arte').value = form.arte;
    $<HTMLInputElement>('an-titulo').value = form.titulo;
  } catch (e) {
    semPasta = true;
    texto($('an-aviso'), erroDe(e));
  }
  atualizar();
}

async function criar(montar: boolean): Promise<void> {
  const v = validar(form);
  if (rodando || lendo || !(montar ? v.podeCriar : v.podeCriarSoPasta)) return;
  rodando = true;
  atualizar();
  mensagem('');
  const parar = comecarPassos(false);
  try {
    const res = await api.anunciosCriar(montarEntrada(form), montar);
    mostrarResultado(res, 'criar');
  } catch (e) {
    passos = fecharPassosPendentes(passos);
    desenharPassos();
    mensagem(`Não consegui criar o anúncio: ${erroDe(e)}`);
  } finally {
    parar();
    rodando = false;
    atualizar();
  }
}

/** Segundo clique: o Corel já está aberto, monta o .cdr da pasta que acabou de ser criada. */
async function montarAgora(): Promise<void> {
  if (rodando || lendo || !pastaCriada) return;
  rodando = true;
  $<HTMLButtonElement>('an-montar-agora').disabled = true;
  atualizar();
  mensagem('');
  const parar = comecarPassos(true);
  try {
    const res = await api.anunciosMontarNoCorel(pastaCriada);
    mostrarResultado(res, 'montar');
  } catch (e) {
    passos = fecharPassosPendentes(passos);
    desenharPassos();
    mensagem(`Não consegui montar no Corel: ${erroDe(e)}`);
  } finally {
    parar();
    rodando = false;
    atualizar();
  }
}

function item(lista: HTMLElement, t: string): void {
  const li = document.createElement('li');
  li.textContent = t;
  lista.append(li);
}

function mostrarResultado(r: Awaited<ReturnType<MockupApi['anunciosCriar']>>, origem: 'criar' | 'montar'): void {
  existente = r.existente;
  // a pasta do botão "Montar no Corel agora": um criar novo troca; um montar que falhou sem pasta mantém a de antes
  if (origem === 'criar') pastaCriada = r.ok && r.pasta ? r.pasta : undefined;
  else if (r.pasta) pastaCriada = r.pasta;
  const lista = $('an-res-lista');
  lista.replaceChildren();
  if (!r.ok) {
    passos = fecharPassosPendentes(passos);
    desenharPassos();
  }
  $('an-res-titulo').textContent = tituloFinal(passos, { ok: r.ok, existente: r.existente, avisos: r.avisos ?? [], etapaCorel: r.etapaCorel });
  if (r.ok) {
    if (r.pasta) item(lista, `Pasta: ${r.pasta}`);
    if (origem === 'criar') {
      item(lista, 'Arquivo .txt do anúncio');
      item(lista, 'Cópia da arte na pasta');
    }
    if (r.etapaCorel === 'feito') item(lista, 'Arquivo .cdr montado no Corel');
    const t = textoDaEtapaCorel(r.etapaCorel);
    if (t) item(lista, t);
  } else {
    item(lista, r.motivo ?? 'Algo deu errado.');
    if (r.existente) item(lista, `Pasta existente: ${r.existente}`);
  }
  for (const a of r.avisos ?? []) item(lista, `Aviso: ${a}`);
  const barras = $('an-res-barras');
  barras.replaceChildren();
  for (const im of r.imagensEan ?? []) {
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = svgParaDataUri(im.svg);
    img.alt = im.nome;
    const leg = document.createElement('figcaption');
    leg.textContent = im.nome;
    fig.append(img, leg);
    barras.append(fig);
  }
  barras.hidden = !barras.childElementCount;
  $('an-res-acoes').hidden = !r.existente;
  const falta = r.ok && (r.etapaCorel === 'aguardando-clique' || r.etapaCorel === 'erro');
  $('an-montar-agora').hidden = !(pastaCriada && (falta || (origem === 'montar' && !r.ok)));
  $('an-resultado').hidden = false;
}

function novoAnuncio(): void {
  if (rodando || lendo) return;
  pastaCriada = undefined;
  $('an-montar-agora').hidden = true;
  form = { ...formVazio(), plataforma: form.plataforma, categoria: form.categoria };
  $<HTMLInputElement>('an-arte').value = '';
  $<HTMLInputElement>('an-titulo').value = '';
  $('an-resultado').hidden = true;
  $('an-passos').hidden = true;
  texto($('an-fontes'), '');
  mensagem('');
  desenharLinhas();
}

export function iniciarAnuncios(): void {
  if (iniciado) return;
  iniciado = true;
  const zona = $('an-zona');
  const arquivos = $<HTMLInputElement>('an-arquivos');
  zona.addEventListener('click', () => { if (!semPasta && !rodando && !lendo) arquivos.click(); });
  zona.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !semPasta && !rodando && !lendo) { e.preventDefault(); arquivos.click(); } });
  arquivos.addEventListener('change', () => {
    const lista = Array.from(arquivos.files ?? []);
    arquivos.value = '';
    if (lista.length) void receberArquivos(lista);
  });
  // o drop é tratado aqui e não sobe para o tratador geral (que abriria o PDF na aba MKP)
  zona.addEventListener('dragover', (e) => e.preventDefault());
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove('arrastando');
    if (semPasta) return;
    const lista = Array.from(e.dataTransfer?.files ?? []);
    if (lista.length) void receberArquivos(lista);
  });
  $('an-plataforma').addEventListener('change', () => {
    form = { ...form, plataforma: $<HTMLSelectElement>('an-plataforma').value, categoria: '' };
    void carregarCategorias().then(atualizar);
  });
  $('an-categoria').addEventListener('change', () => {
    const sel = $<HTMLSelectElement>('an-categoria');
    if (sel.value === NOVA) {
      sel.value = ultimaCategoria;
      $('an-nova-cat').hidden = false;
      $<HTMLInputElement>('an-nova-cat-nome').focus();
      return;
    }
    form = { ...form, categoria: sel.value };
    ultimaCategoria = sel.value;
    atualizar();
  });
  const fecharNova = () => { $('an-nova-cat').hidden = true; $<HTMLInputElement>('an-nova-cat-nome').value = ''; texto($('an-nova-cat-erro'), ''); };
  $('an-nova-cat-cancelar').addEventListener('click', fecharNova);
  const okNova = async () => {
    const nome = $<HTMLInputElement>('an-nova-cat-nome').value;
    try {
      const r = await api.anunciosCriarCategoria(form.plataforma, nome);
      if (!r.ok) { texto($('an-nova-cat-erro'), r.motivo); return; }
      fecharNova();
      await carregarCategorias(r.nome);
      atualizar();
    } catch (e) {
      texto($('an-nova-cat-erro'), erroDe(e));
    }
  };
  $('an-nova-cat-ok').addEventListener('click', () => void okNova());
  $('an-nova-cat-nome').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') void okNova(); });
  $('an-arte').addEventListener('input', () => { form = { ...form, arte: $<HTMLInputElement>('an-arte').value }; atualizar(); });
  $('an-titulo').addEventListener('input', () => { form = { ...form, titulo: $<HTMLInputElement>('an-titulo').value }; atualizar(); });
  $('an-mais').addEventListener('click', adicionarMais);
  $('an-limpar').addEventListener('click', () => {
    if (rodando || lendo) return;
    form = limparArte(form);
    texto($('an-fontes'), '');
    mensagem('');
    desenharLinhas();
  });
  $('an-criar').addEventListener('click', () => void criar(true));
  $('an-so-pasta').addEventListener('click', () => void criar(false));
  $('an-abrir-existente').addEventListener('click', () => {
    if (!existente) return;
    void api.anunciosAbrirPasta(existente).then((r) => { if (!r.ok) mensagem(r.motivo); }, (e) => mensagem(erroDe(e)));
  });
  $('an-outro-nome').addEventListener('click', () => {
    $('an-resultado').hidden = true;
    $<HTMLInputElement>('an-arte').focus();
    $<HTMLInputElement>('an-arte').select();
  });
  $('an-novo').addEventListener('click', novoAnuncio);
  $('an-montar-agora').addEventListener('click', () => void montarAgora());
  atualizar();
}
