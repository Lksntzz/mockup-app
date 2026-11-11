import { execFile } from 'node:child_process';
import { readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Macros do módulo MKP (tools/corel/MKP.bas) que o app sabe chamar. */
export type MacroDoCorel = 'ArteDoClienteNoMolde' | 'ExportarPDFparaMKP';

export type ResultadoCorel = { ok: true } | { ok: false; motivo: string };

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

/** Script que liga no CorelDRAW (ou abre) e roda o macro. Tenta as duas formas de endereçar o módulo. */
export function scriptVbs(macro: MacroDoCorel): string {
  return [
    'On Error Resume Next',
    'Dim app, ok',
    'Set app = GetObject(, "CorelDRAW.Application")',
    'If Err.Number <> 0 Then',
    '  Err.Clear',
    '  Set app = CreateObject("CorelDRAW.Application")',
    'End If',
    'If Err.Number <> 0 Then',
    '  WScript.Echo "ERRO: nao consegui falar com o CorelDRAW (" & Err.Description & ")"',
    '  WScript.Quit 2',
    'End If',
    'app.Visible = True',
    'ok = False',
    `app.GMSManager.RunMacro "GlobalMacros", "MKP.${macro}"`,
    'If Err.Number = 0 Then ok = True',
    'If Not ok Then',
    '  Err.Clear',
    `  app.GMSManager.RunMacro "GlobalMacros.MKP", "${macro}"`,
    '  If Err.Number = 0 Then ok = True',
    'End If',
    'If ok Then',
    '  WScript.Echo "OK"',
    'Else',
    `  WScript.Echo "ERRO: o CorelDRAW nao achou o macro ${macro} no modulo MKP (" & Err.Description & ")"`,
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
