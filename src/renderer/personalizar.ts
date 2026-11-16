import { inicialDoNome, modeloPorId, semAcento, validarEntrada } from '../personalizar/modelo';
import type { EstadoDasArtes, MockupApi } from './global';

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
let previaAtual: { modelo: string; nome: string; inicial: string } | undefined;
let urlPrevia: string | undefined;

const modeloEscolhido = (): string => $<HTMLSelectElement>('pz-arte').value;
/** A arte escolhida deixa acento na letra grande? */
const comAcento = (): boolean => modeloPorId(modeloEscolhido())?.inicialComAcento === true;

function entradaDaTela() {
  return validarEntrada({ nome: $<HTMLInputElement>('pz-nome').value, inicial: $<HTMLInputElement>('pz-inicial').value }, false, comAcento());
}

function atualizarBotao(): void {
  const v = entradaDaTela();
  const copias = Number($<HTMLInputElement>('pz-copias').value);
  const copiasOk = Number.isInteger(copias) && copias >= 1 && copias <= 99;
  const impressora = $<HTMLSelectElement>('pz-impressora').value;
  const bate = v.ok && previaAtual?.modelo === modeloEscolhido() && previaAtual.nome === v.nome && previaAtual.inicial === v.inicial;
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
  pendentePrevia = setTimeout(() => void gerarPrevia(modeloEscolhido(), v.nome, v.inicial), 250);
}

async function gerarPrevia(modelo: string, nome: string, inicial: string): Promise<void> {
  const minha = ++seqPrevia;
  gerando = true;
  atualizarBotao();
  try {
    const r = await api.personalizarPrevia(modelo, nome, inicial);
    if (minha !== seqPrevia) return; // chegou depois de uma digitação mais nova
    if (!r.ok) {
      $<HTMLImageElement>('pz-img').hidden = true;
      texto($('pz-previa-msg'), r.motivo);
      return;
    }
    if (urlPrevia) URL.revokeObjectURL(urlPrevia);
    urlPrevia = URL.createObjectURL(new Blob([r.png as BlobPart], { type: 'image/jpeg' }));
    const img = $<HTMLImageElement>('pz-img');
    img.src = urlPrevia;
    img.hidden = false;
    texto($('pz-previa-msg'), r.aviso ?? '');
    previaAtual = { modelo, nome, inicial };
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

/** Mostra a lista de artes (lembrando a última escolhida) e liga o corpo da tela se a arte escolhida está inteira no programa. */
function mostrarEstado(e: EstadoDasArtes): void {
  const sel = $<HTMLSelectElement>('pz-arte');
  const antes = sel.value || (() => { try { return localStorage.getItem('pz-arte') ?? ''; } catch { return ''; } })();
  sel.replaceChildren();
  for (const a of e.artes) {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.titulo;
    sel.append(o);
  }
  if (e.artes.some((a) => a.id === antes)) sel.value = antes;
  atualizarArteEscolhida(e);
}

let ultimoEstado: EstadoDasArtes = { artes: [] };

function atualizarArteEscolhida(e: EstadoDasArtes): void {
  titulo();
  ultimoEstado = e;
  const escolhida = e.artes.find((a) => a.id === modeloEscolhido());
  modeloOk = escolhida?.ok === true;
  const aviso = $('pz-aviso');
  aviso.hidden = modeloOk;
  texto(aviso, modeloOk ? '' : (escolhida?.motivo ?? 'Nenhuma arte disponível.'));
  $('pz-corpo').hidden = !modeloOk;
  atualizarBotao();
}

export async function mostrarPersonalizar(): Promise<void> {
  try {
    let lembrada: string | undefined;
    try { lembrada = localStorage.getItem('pz-arte') ?? undefined; } catch { /* sem armazenamento: usa a primeira */ }
    mostrarEstado(await api.personalizarEstado(lembrada));
    if (modeloOk) {
      await carregarImpressoras();
      if (!previaAtual) agendarPrevia();
    }
  } catch (e) {
    mostrarEstado({ artes: [] });
    texto($('pz-aviso'), erroDe(e));
    $('pz-aviso').hidden = false;
  }
}

/** O título da página mostra o nome da arte escolhida. */
function titulo(): void {
  const t = modeloPorId(modeloEscolhido())?.titulo;
  const h = document.getElementById('pz-titulo');
  if (t && h) h.textContent = `Personalizar — ${t}`;
}

export function iniciarPersonalizar(): void {
  $<HTMLSelectElement>('pz-arte').addEventListener('change', () => {
    try { localStorage.setItem('pz-arte', modeloEscolhido()); } catch { /* sem armazenamento: só não lembra */ }
    atualizarArteEscolhida(ultimoEstado);
    if (!inicialManual) $<HTMLInputElement>('pz-inicial').value = inicialDoNome($<HTMLInputElement>('pz-nome').value, comAcento());
    else if (!comAcento()) $<HTMLInputElement>('pz-inicial').value = semAcento($<HTMLInputElement>('pz-inicial').value);
    if (modeloOk) agendarPrevia();
  });
  $<HTMLInputElement>('pz-nome').addEventListener('input', () => {
    if (!inicialManual) $<HTMLInputElement>('pz-inicial').value = inicialDoNome($<HTMLInputElement>('pz-nome').value, comAcento());
    agendarPrevia();
  });
  $<HTMLInputElement>('pz-inicial').addEventListener('input', () => {
    // apagar a letra volta para o automático; digitar uma letra passa a valer a do operador
    const campo = $<HTMLInputElement>('pz-inicial');
    if (!comAcento() && semAcento(campo.value) !== campo.value) campo.value = semAcento(campo.value); // nesta arte a letra grande não leva acento
    const v = campo.value;
    inicialManual = v.trim() !== '';
    if (!inicialManual) $<HTMLInputElement>('pz-inicial').value = inicialDoNome($<HTMLInputElement>('pz-nome').value, comAcento());
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
    void api.personalizarImprimir(modeloEscolhido(), v.nome, v.inicial, copias, impressora).then(
      (r) => texto($('pz-msg'), r.ok
        ? `Enviado para "${impressora}": ${copias} ${copias === 1 ? 'via' : 'vias'} de ${v.nome}.${r.preparoMs !== undefined && r.envioMs !== undefined ? ` (preparar a página: ${(r.preparoMs / 1000).toFixed(1)} s; a impressora aceitar o trabalho: ${(r.envioMs / 1000).toFixed(1)} s)` : ''}`
        : r.motivo),
      (e) => texto($('pz-msg'), erroDe(e)),
    ).finally(() => { imprimindo = false; atualizarBotao(); });
  });
}
