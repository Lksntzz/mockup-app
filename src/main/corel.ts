import { execFile } from 'node:child_process';
import { readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Macros do módulo MKP (tools/corel/MKP.bas) que o app sabe chamar. */
export type MacroDoCorel = 'ArteDoClienteNoMolde' | 'ExportarPDFparaMKP';

export type ResultadoCorel = { ok: true } | { ok: false; motivo: string; aberto?: true };

export type ExecutorVbs = (arquivoVbs: string) => Promise<{ codigo: number; saida: string }>;

export interface OpcoesCorel {
  plataforma?: NodeJS.Platform;
  pastaTemporaria?: string;
  executar?: ExecutorVbs;
}

/** O macro lê o caminho desse arquivo (na pasta temporária) e o apaga em seguida. */
const ARQUIVO_DO_CAMINHO: Record<MacroDoCorel, string> = {
  ArteDoClienteNoMolde: 'mockup-arte.txt',
  ExportarPDFparaMKP: 'mockup-pdf.txt',
};

/** O VBA lê o arquivo na página de código do Windows em português (letras até 0xFF, sem a faixa de controle 0x80–0x9F). */
export function caminhoServeParaOCorel(caminho: string): boolean {
  if (!caminho) return false;
  for (const ch of caminho) {
    const c = ch.codePointAt(0)!;
    if (c > 0xff || (c >= 0x80 && c <= 0x9f)) return false;
  }
  return true;
}

/** Onde fica o molde (o mesmo caminho que o macro MKP.bas usa). */
export const CAMINHO_DO_MOLDE = 'C:\\MOLDE\\MOLDE.cdr';

/**
 * Script que liga no CorelDRAW e roda o macro.
 * O Corel NÃO aparece para GetObject: só CreateObject conecta no que já está aberto. Por isso "está aberto?" se descobre pelos processos do Windows.
 * Corel fechado + macro da arte: abre o arquivo do molde pelo Windows (como um duplo clique, que carrega os macros do usuário;
 * abrir por automação deixava o Corel vazio, sem o GlobalMacros) e espera ele ficar pronto.
 * Corel fechado + macro do PDF: não abre nada, porque o PDF é do documento que já está aberto.
 */
export function scriptVbs(macro: MacroDoCorel): string {
  const arte = macro === 'ArteDoClienteNoMolde';
  // Corel que "existe" mas não aceita conexão (travado ou resto de uma queda): para a arte, finaliza e abre de novo; para o PDF, avisa.
  const naoResponde = arte
    ? [
        '    diag = diag & ", corel nao respondeu (" & Err.Number & "): finalizei e vou abrir de novo"',
        '    Set sh = CreateObject("WScript.Shell")',
        '    sh.Run "taskkill /F /IM CorelDRW.exe", 0, True',
        '    WScript.Sleep 4000',
        '    rodando = False',
        '    Err.Clear',
      ]
    : [
        '    WScript.Echo "ERRO: o CorelDRAW nao esta respondendo (" & Err.Number & "). Feche ele pelo Gerenciador de Tarefas, abra o .cdr do cliente e tente de novo."',
        '    WScript.Quit 2',
      ];
  // Corel fechado + arte: só abre o molde pelo Windows (como um duplo clique) e para. Mandar comandos a um Corel recém-aberto travava ele;
  // com ele já aberto e carregado o macro funciona, então o app pede um segundo clique.
  const corelFechado = arte
    ? [
        '  Set sh = CreateObject("WScript.Shell")',
        `  sh.Run """${CAMINHO_DO_MOLDE}""", 1, False`,
        '  WScript.Echo "ABERTO: abri o CorelDRAW com o molde."',
        '  WScript.Quit 0',
      ]
    : [
        '  WScript.Echo "ERRO: o CorelDRAW nao esta aberto. Abra o .cdr do cliente nele e tente de novo."',
        '  WScript.Quit 2',
      ];
  return [
    'On Error Resume Next',
    'Dim app, sh, wmi, procs, rodando, ok, esperando, limite, maximo, tentativa, erro1, erro2, i, diag, n1, n2, pronto, execp, saida',
    'esperando = False',
    'rodando = True', // se não der para olhar os processos, supõe aberto: conectar é o caminho seguro
    'diag = "wmi=falhou"',
    'Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")',
    'If Err.Number = 0 Then',
    "  Set procs = wmi.ExecQuery(\"SELECT * FROM Win32_Process WHERE Name = 'CorelDRW.exe'\")",
    '  If Err.Number = 0 Then',
    '    rodando = (procs.Count > 0)',
    '    diag = "processos CorelDRW.exe=" & procs.Count',
    '  Else',
    '    diag = "wmi consulta falhou: " & Err.Number',
    '  End If',
    'Else',
    '  diag = "wmi falhou: " & Err.Number & " " & Err.Description',
    'End If',
    'Err.Clear',
    // Corel "aberto": uma conexão de teste. Sem resposta = travado ou sobra de queda.
    'If rodando Then',
    '  Set app = CreateObject("CorelDRAW.Application")',
    '  If Err.Number <> 0 Then',
    ...naoResponde,
    '  End If',
    'End If',
    'If Not rodando Then',
    ...corelFechado,
    'End If',
    // recém-aberto por nós: poucas tentativas espaçadas (insistir a cada 2 s travava o Corel carregando)
    'limite = 1',
    'For i = 1 To limite',
    '  Err.Clear',
    '  Set app = CreateObject("CorelDRAW.Application")',
    '  If Err.Number = 0 Then Exit For',
    '  WScript.Sleep 5000',
    'Next',
    'If Err.Number <> 0 Then',
    '  WScript.Echo "ERRO: nao consegui falar com o CorelDRAW (" & Err.Description & ") | Diagnostico: " & diag',
    '  WScript.Quit 2',
    'End If',
    'app.Visible = True',
    // o Corel só carrega o VBA (e o GlobalMacros) quando precisa; quem controla de fora tem que pedir
    'app.InitializeVBA',
    'Err.Clear',
    'ok = False',
    // só repete quando o Corel respondeu "macro não encontrado" (ainda carregando); erro de conexão (462) não se repete
    'maximo = 1',
    'For tentativa = 1 To maximo',
    '  Err.Clear',
    `  app.GMSManager.RunMacro "GlobalMacros", "MKP.${macro}"`,
    '  If Err.Number = 0 Then ok = True : Exit For',
    '  erro1 = Err.Description : n1 = Err.Number',
    '  If n1 = 462 Then Exit For',
    '  Err.Clear',
    `  app.GMSManager.RunMacro "GlobalMacros.MKP", "${macro}"`,
    '  If Err.Number = 0 Then ok = True : Exit For',
    '  erro2 = Err.Description : n2 = Err.Number',
    '  If tentativa < maximo Then WScript.Sleep 5000',
    'Next',
    'If ok Then',
    '  WScript.Echo "OK"',
    'Else',
    `  WScript.Echo "ERRO: o CorelDRAW nao rodou o macro ${macro}. Tentativa 1: " & erro1 & " (" & n1 & ") | Tentativa 2: " & erro2 & " (" & n2 & ") | Diagnostico: " & diag & ", corel aberto pelo app=" & esperando`,
    '  WScript.Quit 3',
    'End If',
    '',
  ].join('\r\n');
}

const DEZ_MINUTOS = 10 * 60 * 1000;

const executarComCscript: ExecutorVbs = (arquivoVbs) =>
  new Promise((resolver, rejeitar) => {
    execFile('cscript', ['//nologo', arquivoVbs], { windowsHide: true, timeout: DEZ_MINUTOS }, (erro, stdout) => {
      const codigo = erro && typeof (erro as { code?: unknown }).code === 'number' ? ((erro as { code: number }).code) : erro ? 1 : 0;
      if (erro && (erro as { killed?: boolean }).killed) {
        rejeitar(new Error('tempo esgotado'));
        return;
      }
      if (erro && (erro as { code?: unknown }).code === 'ENOENT') {
        rejeitar(new Error('cscript não encontrado'));
        return;
      }
      resolver({ codigo, saida: String(stdout) });
    });
  });

/**
 * Roda um macro do CorelDRAW pelo app. O caminho (da arte, ou da pasta do cliente) vai por um arquivo temporário
 * que o macro lê e apaga; o app apaga de novo no fim para não sobrar caminho velho.
 */
export async function rodarMacroDoCorel(macro: MacroDoCorel, caminho: string, opcoes: OpcoesCorel = {}): Promise<ResultadoCorel> {
  const plataforma = opcoes.plataforma ?? process.platform;
  if (plataforma !== 'win32') return { ok: false, motivo: 'Isso só funciona no Windows, com o CorelDRAW instalado.' };
  if (!caminhoServeParaOCorel(caminho)) {
    return { ok: false, motivo: 'O caminho tem letras que o Corel não consegue ler pelo macro. Abra o arquivo no Corel pelo menu.' };
  }
  const pasta = opcoes.pastaTemporaria ?? tmpdir();
  const executar = opcoes.executar ?? executarComCscript;
  const arquivoCaminho = join(pasta, ARQUIVO_DO_CAMINHO[macro]);
  const arquivoVbs = join(pasta, `mockup-${macro}.vbs`);
  try {
    await writeFile(arquivoCaminho, Buffer.from(caminho, 'latin1'));
    await writeFile(arquivoVbs, scriptVbs(macro), 'latin1');
    const r = await executar(arquivoVbs);
    if (r.codigo === 0 && /^ABERTO/m.test(r.saida)) {
      return {
        ok: false,
        aberto: true,
        motivo: 'Abri o CorelDRAW com o molde. Espere ele carregar por inteiro (uns 30 segundos, sem mexer) e clique de novo em "Abrir no molde (Corel)".',
      };
    }
    if (r.codigo === 0 && /^OK\s*$/m.test(r.saida)) return { ok: true };
    const linha = r.saida.split(/\r?\n/).find((l) => l.startsWith('ERRO:'));
    return { ok: false, motivo: linha ? linha.slice(5).trim() : 'O Corel não confirmou que rodou o macro.' };
  } catch (e) {
    return { ok: false, motivo: `Não consegui chamar o Corel: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    await unlink(arquivoCaminho).catch(() => undefined);
    await unlink(arquivoVbs).catch(() => undefined);
  }
}

/** Confere na pasta se o macro realmente produziu o arquivo (o Corel devolve "rodou" mesmo quando o macro mostrou um aviso de erro). */
export async function achouArquivoNovo(pasta: string, depoisDe: number, padrao: RegExp): Promise<boolean> {
  try {
    for (const nome of await readdir(pasta)) {
      if (!padrao.test(nome)) continue;
      const info = await stat(join(pasta, nome)).catch(() => null);
      // folga de 2 s: o relógio do Drive/disco de rede pode atrasar um pouco
      if (info && info.mtimeMs >= depoisDe - 2000) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Texto que o macro lê: destino do .cdr, arte da frente e arte do verso (uma por linha; vazia quando não há). */
export function linhasDoMolde(e: { destino: string; frente?: string; verso?: string }): string {
  return [e.destino, e.frente ?? '', e.verso ?? ''].join('\r\n');
}

export interface FaceDoMolde {
  estado: 'ok' | 'sem' | 'erro';
  /** Tamanho que a arte ficou (ok) ou o motivo (erro). */
  detalhe?: string;
}
export interface ResultadoDoMolde {
  frente?: FaceDoMolde;
  verso?: FaceDoMolde;
  /** O .cdr do cliente já existia: o macro só abriu, sem importar nada. */
  jaExistia?: boolean;
}

/** Lê o que o macro anotou ("frente=OK 150,0 x 210,0 mm", "verso=SEM", "existente=1"). */
export function interpretarResultadoDoMolde(texto: string): ResultadoDoMolde {
  const r: ResultadoDoMolde = {};
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^(frente|verso|existente)=(.*)$/.exec(linha.trim());
    if (!m) continue;
    const [, chave, valor = ''] = m;
    if (chave === 'existente') {
      r.jaExistia = valor.trim() === '1';
      continue;
    }
    const face: FaceDoMolde = valor.startsWith('OK')
      ? { estado: 'ok', ...(valor.slice(2).trim() ? { detalhe: valor.slice(2).trim() } : {}) }
      : valor.startsWith('SEM')
        ? { estado: 'sem' }
        : { estado: 'erro', ...(valor.replace(/^ERRO\s*/, '').trim() ? { detalhe: valor.replace(/^ERRO\s*/, '').trim() } : {}) };
    if (chave === 'frente') r.frente = face;
    else r.verso = face;
  }
  return r;
}

/** Lê (e apaga) o arquivo de resultado que o macro grava na pasta temporária. */
export async function lerResultadoDoMolde(pasta: string = tmpdir()): Promise<ResultadoDoMolde | undefined> {
  const arquivo = join(pasta, 'mockup-resultado.txt');
  try {
    const texto = (await readFile(arquivo)).toString('latin1');
    await unlink(arquivo).catch(() => undefined);
    return interpretarResultadoDoMolde(texto);
  } catch {
    return undefined;
  }
}
