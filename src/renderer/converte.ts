import { LINKS_DE_LICENCA } from '../converte/licencas';
import ffmpegStatic from '../../node_modules/ffmpeg-static/package.json';
import { formatarBytes, formatarTempo, rotuloDoFormato, rotuloDoVideo } from '../app/converte-ui';
import type { InfoDoVideo } from '../converte/info';
import type { MockupApi } from './global';
import { formatosPossiveis, planejar, type Formato, type Nivel, type Pedido } from '../converte/plano';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const nomeDoArquivo = (caminho: string): string => caminho.split(/[\\/]/).pop() ?? caminho;

const DICAS_DE_VIDEO: Record<Nivel, string> = { original: 'Original', medio: 'Médio — até 1080 p', pequeno: 'Pequeno — até 720 p' };
const DICAS_DE_MP3: Record<Nivel, string> = { original: 'Original — 192 kbps', medio: 'Médio — 128 kbps', pequeno: 'Pequeno — 96 kbps' };

/** Liga a tela do Converte à ponte com o programa. Tudo que vem de fora entra na tela como texto, nunca como HTML. */
export function iniciarConverte(): void {
  const api = (window as unknown as { mockupApi: MockupApi }).mockupApi;
  let caminho: string | null = null;
  let info: InfoDoVideo | null = null;
  let formato: Formato = 'mp4';
  let convertendo = false;
  let saidaFinal: string | null = null;

  const cartao = $('cv-cartao');
  const erro = $('cv-erro');
  const nota = $('cv-nota');
  const botaoConverter = $<HTMLButtonElement>('cv-converter');
  const botaoCancelar = $<HTMLButtonElement>('cv-cancelar');
  const campoMb = $<HTMLInputElement>('cv-mb');
  const radiosDeTamanho = () => [...document.querySelectorAll<HTMLInputElement>('input[name="cv-tamanho"]')];

  const mostrar = (el: HTMLElement, texto: string): void => {
    el.textContent = texto;
    el.hidden = false;
  };

  function pedido(): Pedido {
    const marcado = radiosDeTamanho().find((r) => r.checked)?.value ?? 'original';
    if (marcado === 'maximo') return { formato, tamanho: { tipo: 'maximo', mb: Number.parseFloat(campoMb.value.replace(',', '.')) } };
    return { formato, tamanho: { tipo: 'nivel', nivel: marcado as Nivel } };
  }

  function bloquear(bloqueado: boolean): void {
    for (const el of cartao.querySelectorAll<HTMLInputElement>('input')) el.disabled = bloqueado;
  }

  function atualizar(): void {
    if (!info) return;
    const dicas = formato === 'mp3' ? DICAS_DE_MP3 : DICAS_DE_VIDEO;
    for (const n of ['original', 'medio', 'pequeno'] as Nivel[]) $(`cv-rot-${n}`).textContent = dicas[n];
    const plano = planejar(info, pedido());
    const aviso = $('cv-aviso');
    aviso.classList.toggle('recusa', !plano.ok);
    if (!plano.ok) {
      mostrar(aviso, plano.motivo);
      $('cv-estimativa').textContent = '';
    } else {
      if (plano.aviso) mostrar(aviso, plano.aviso);
      else aviso.hidden = true;
      $('cv-estimativa').textContent =
        (plano.estimativaBytes === null ? 'Sem estimativa de tamanho para este arquivo.' : `Tamanho estimado: cerca de ${formatarBytes(plano.estimativaBytes)}.`) +
        (plano.modo === 'copiar' ? ' Sem recodificar: rápido e sem perda de qualidade.' : '');
    }
    botaoConverter.disabled = convertendo || !plano.ok;
  }

  function desenharFormatos(): void {
    const caixa = $('cv-formatos');
    caixa.replaceChildren();
    for (const f of formatosPossiveis(info!)) {
      const rotulo = document.createElement('label');
      rotulo.className = 'cv-opcao';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'cv-formato';
      radio.value = f;
      radio.checked = f === formato;
      radio.addEventListener('change', () => {
        formato = f;
        atualizar();
      });
      const texto = document.createElement('span');
      texto.textContent = rotuloDoFormato(f, info!);
      rotulo.append(radio, texto);
      caixa.append(rotulo);
    }
  }

  function limparResultado(): void {
    $('cv-pronto').hidden = true;
    $('cv-andamento').hidden = true;
    erro.hidden = true;
    saidaFinal = null;
  }

  async function carregar(escolhido: string, varios = false): Promise<void> {
    if (convertendo) {
      mostrar(nota, 'Espere a conversão terminar antes de abrir outro vídeo.');
      return;
    }
    nota.hidden = !varios;
    if (varios) nota.textContent = 'Converto um vídeo por vez; usei o primeiro.';
    limparResultado();
    const r = await api.converteLer(escolhido);
    if (!r.ok) {
      caminho = null;
      info = null;
      cartao.hidden = true;
      mostrar(erro, r.motivo);
      return;
    }
    const lido = r.info;
    caminho = escolhido;
    info = lido;
    formato = formatosPossiveis(lido).includes('mp4') ? 'mp4' : 'mp3';
    mostrar($('cv-rotulo'), rotuloDoVideo(nomeDoArquivo(escolhido), lido));
    desenharFormatos();
    cartao.hidden = false;
    atualizar();
  }

  $('cv-escolher').addEventListener('click', () => {
    void api.converteEscolher().then((c) => (c ? carregar(c) : undefined));
  });
  $('converte').addEventListener('drop', (e) => {
    const arquivos = [...(e.dataTransfer?.files ?? [])];
    const primeiro = arquivos[0];
    if (!primeiro) return;
    void carregar(api.caminhoDoArquivo(primeiro), arquivos.length > 1);
  });
  for (const r of radiosDeTamanho()) r.addEventListener('change', atualizar);
  // digitar no campo "Máximo de … MB" escolhe essa opção (e desmarca Original/Médio/Pequeno)
  campoMb.addEventListener('input', () => {
    const maximo = radiosDeTamanho().find((r) => r.value === 'maximo');
    if (maximo) maximo.checked = true;
    atualizar();
  });

  api.aoProgredirConverte((p) => {
    if (!convertendo) return;
    $<HTMLProgressElement>('cv-barra').value = p.fracao;
    $('cv-pct').textContent = `${Math.floor(p.fracao * 100)}%`;
    $('cv-restante').textContent = p.fracao >= 1 ? 'finalizando…' : p.restanteS === null ? 'calculando o tempo restante…' : `faltam cerca de ${formatarTempo(p.restanteS)}`;
  });

  botaoConverter.addEventListener('click', () => {
    if (!caminho || !info || convertendo) return;
    const origem = caminho;
    convertendo = true;
    limparResultado();
    bloquear(true);
    botaoConverter.disabled = true;
    botaoCancelar.disabled = false;
    botaoCancelar.textContent = 'Cancelar';
    $<HTMLProgressElement>('cv-barra').value = 0;
    $('cv-pct').textContent = '0%';
    $('cv-restante').textContent = 'calculando o tempo restante…';
    $('cv-andamento').hidden = false;
    void api
      .converteIniciar(origem, pedido())
      .then((r) => {
        if (r.ok) {
          saidaFinal = r.saida;
          mostrar($('cv-pronto-texto'), `Pronto: ${nomeDoArquivo(r.saida)} (${formatarBytes(r.bytes)})`);
          $('cv-pronto').hidden = false;
        } else if (!r.cancelado) {
          mostrar(erro, r.motivo);
        }
      })
      .catch((e: unknown) => mostrar(erro, e instanceof Error ? e.message : String(e)))
      .finally(() => {
        convertendo = false;
        $('cv-andamento').hidden = true;
        bloquear(false);
        atualizar();
      });
  });
  botaoCancelar.addEventListener('click', () => {
    botaoCancelar.disabled = true;
    botaoCancelar.textContent = 'Cancelando…';
    void api.converteCancelar();
  });
  $('cv-abrir-pasta').addEventListener('click', () => {
    if (saidaFinal) void api.converteAbrirPasta(saidaFinal);
  });

  // ---- painel "Licenças": o link só abre os endereços combinados (a lista é a mesma que o programa principal confere) ----
  $('cv-licencas-versao').textContent = ffmpegStatic.version;
  void api.converteVersao().then((v) => ($('cv-licencas-ffmpeg').textContent = v ?? 'não consegui ler'), () => ($('cv-licencas-ffmpeg').textContent = 'não consegui ler'));
  const links = $('cv-licencas-links');
  for (const l of LINKS_DE_LICENCA) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'secundario';
    b.textContent = l.texto;
    b.title = l.url;
    b.addEventListener('click', () => void api.abrirLinkDeLicenca(l.url));
    links.append(b);
  }
  $('cv-licencas').addEventListener('click', () => {
    const painel = $('cv-licencas-painel');
    painel.hidden = !painel.hidden;
    $('cv-licencas').setAttribute('aria-expanded', String(!painel.hidden));
    if (!painel.hidden) painel.scrollIntoView({ block: 'nearest' });
  });
}
