import { inicialDoNome, validarEntrada } from '../personalizar/modelo';
import type { MockupApi } from './global';

const api: MockupApi = (window as unknown as { mockupApi: MockupApi }).mockupApi;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const texto = (el: HTMLElement, t: string) => { el.textContent = t; };
const erroDe = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e));

let modeloOk = false;
let inicialManual = false;
let imprimindo = false;
let gerando = false;
let seqPrevia = 0;
let pendentePrevia: ReturnType<typeof setTimeout> | undefined;
/** O que a prévia na tela mostra: o botão Imprimir só vale para exatamente isso (nada de imprimir um nome diferente do que se vê). */
let previaAtual: { nome: string; inicial: string } | undefined;
let urlPrevia: string | undefined;

function entradaDaTela() {
  return validarEntrada({ nome: $<HTMLInputElement>('pz-nome').value, inicial: $<HTMLInputElement>('pz-inicial').value });
}

function atualizarBotao(): void {
  const v = entradaDaTela();
  const copias = Number($<HTMLInputElement>('pz-copias').value);
  const copiasOk = Number.isInteger(copias) && copias >= 1 && copias <= 99;
  const impressora = $<HTMLSelectElement>('pz-impressora').value;
  const bate = v.ok && previaAtual?.nome === v.nome && previaAtual.inicial === v.inicial;
  $<HTMLButtonElement>('pz-imprimir').disabled = imprimindo || gerando || !modeloOk || !bate || !copiasOk || impressora === '';
}

function agendarPrevia(): void {
  if (pendentePrevia) clearTimeout(pendentePrevia);
  previaAtual = undefined;
  atualizarBotao();
  const v = entradaDaTela();
  if (!v.ok) {
    $<HTMLImageElement>('pz-img').hidden = true;
    texto($('pz-previa-msg'), v.motivo === 'Digite o nome.' ? 'Digite o nome para ver a prévia.' : v.motivo);
    return;
  }
  texto($('pz-previa-msg'), 'Montando a prévia…');
  pendentePrevia = setTimeout(() => void gerarPrevia(v.nome, v.inicial), 350);
}

async function gerarPrevia(nome: string, inicial: string): Promise<void> {
  const minha = ++seqPrevia;
  gerando = true;
  atualizarBotao();
  try {
    const r = await api.personalizarPrevia(nome, inicial);
    if (minha !== seqPrevia) return; // chegou depois de uma digitação mais nova
    if (!r.ok) {
      $<HTMLImageElement>('pz-img').hidden = true;
      texto($('pz-previa-msg'), r.motivo);
      return;
    }
    if (urlPrevia) URL.revokeObjectURL(urlPrevia);
    urlPrevia = URL.createObjectURL(new Blob([r.png as BlobPart], { type: 'image/png' }));
    const img = $<HTMLImageElement>('pz-img');
    img.src = urlPrevia;
    img.hidden = false;
    texto($('pz-previa-msg'), '');
    previaAtual = { nome, inicial };
  } catch (e) {
    if (minha === seqPrevia) texto($('pz-previa-msg'), erroDe(e));
  } finally {
    if (minha === seqPrevia) gerando = false;
    atualizarBotao();
  }
}

async function carregarImpressoras(): Promise<void> {
  const sel = $<HTMLSelectElement>('pz-impressora');
  const antes = sel.value;
  try {
    const r = await api.personalizarImpressoras();
    if (!r.ok) { texto($('pz-msg'), r.motivo); return; }
    sel.replaceChildren();
    for (const p of r.lista) {
      const o = document.createElement('option');
      o.value = p.nome;
      o.textContent = p.nome;
      sel.append(o);
    }
    const lembrada = (() => { try { return localStorage.getItem('pz-impressora') ?? ''; } catch { return ''; } })();
    const preferida = [antes, lembrada, r.lista.find((p) => p.padrao)?.nome ?? ''].find((n) => n !== '' && r.lista.some((p) => p.nome === n));
    if (preferida) sel.value = preferida;
    if (r.lista.length === 0) texto($('pz-msg'), 'Nenhuma impressora encontrada neste computador.');
  } catch (e) {
    texto($('pz-msg'), erroDe(e));
  }
  atualizarBotao();
}

/** Só o nome do arquivo (Windows ou não), para caber na tela. */
function nomeDoArquivo(caminho: string): string {
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

function mostrarEstado(e: { arte?: string; ok: boolean; motivo: string }): void {
  texto($('pz-pasta'), e.arte ? nomeDoArquivo(e.arte) : 'não escolhida');
  modeloOk = e.ok;
  const aviso = $('pz-aviso');
  aviso.hidden = e.ok;
  texto(aviso, e.ok ? '' : e.motivo);
  $('pz-corpo').hidden = !e.ok;
  atualizarBotao();
}

export async function mostrarPersonalizar(): Promise<void> {
  try {
    mostrarEstado(await api.personalizarEstado());
    if (modeloOk) {
      await carregarImpressoras();
      if (!previaAtual) agendarPrevia();
    }
  } catch (e) {
    mostrarEstado({ ok: false, motivo: erroDe(e) });
  }
}

export function iniciarPersonalizar(): void {
  $('pz-escolher').addEventListener('click', () => {
    void api.personalizarEscolherPasta().then(async (e) => {
      mostrarEstado(e);
      if (e.ok) { await carregarImpressoras(); agendarPrevia(); }
    }, (er) => mostrarEstado({ ok: false, motivo: erroDe(er) }));
  });
  $<HTMLInputElement>('pz-nome').addEventListener('input', () => {
    if (!inicialManual) $<HTMLInputElement>('pz-inicial').value = inicialDoNome($<HTMLInputElement>('pz-nome').value);
    agendarPrevia();
  });
  $<HTMLInputElement>('pz-inicial').addEventListener('input', () => {
    // apagar a letra volta para o automático; digitar uma letra passa a valer a do operador
    const v = $<HTMLInputElement>('pz-inicial').value;
    inicialManual = v.trim() !== '';
    if (!inicialManual) $<HTMLInputElement>('pz-inicial').value = inicialDoNome($<HTMLInputElement>('pz-nome').value);
    agendarPrevia();
  });
  $<HTMLInputElement>('pz-copias').addEventListener('input', atualizarBotao);
  $<HTMLSelectElement>('pz-impressora').addEventListener('change', () => {
    try { localStorage.setItem('pz-impressora', $<HTMLSelectElement>('pz-impressora').value); } catch { /* sem armazenamento: só não lembra */ }
    atualizarBotao();
  });
  $('pz-impressoras').addEventListener('click', () => void carregarImpressoras());
  $('pz-preferencias').addEventListener('click', () => {
    const imp = $<HTMLSelectElement>('pz-impressora').value;
    if (!imp) { texto($('pz-msg'), 'Escolha a impressora primeiro.'); return; }
    texto($('pz-msg'), 'Abrindo as preferências da impressora… escolha o papel e a qualidade, confirme com OK e pronto: o Windows guarda.');
    void api.personalizarPreferencias(imp).then((r) => { if (!r.ok) texto($('pz-msg'), r.motivo); }, (e) => texto($('pz-msg'), erroDe(e)));
  });
  $<HTMLButtonElement>('pz-imprimir').addEventListener('click', () => {
    const v = entradaDaTela();
    if (!v.ok || imprimindo) return;
    const copias = Number($<HTMLInputElement>('pz-copias').value);
    const impressora = $<HTMLSelectElement>('pz-impressora').value;
    imprimindo = true;
    atualizarBotao();
    texto($('pz-msg'), 'Enviando para a impressora…');
    void api.personalizarImprimir(v.nome, v.inicial, copias, impressora).then(
      (r) => texto($('pz-msg'), r.ok ? `Enviado para "${impressora}": ${copias} ${copias === 1 ? 'via' : 'vias'} de ${v.nome}.` : r.motivo),
      (e) => texto($('pz-msg'), erroDe(e)),
    ).finally(() => { imprimindo = false; atualizarBotao(); });
  });
}
