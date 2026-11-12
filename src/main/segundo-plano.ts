/** Decide se fechar a janela deve só esconder o app (continua vigiando a Pasta 1 e alertando). */
export function deveEsconderAoFechar(config: { designer: boolean }, saindo: boolean): boolean {
  return config.designer && !saindo;
}

/** O app iniciado com o Windows (--oculto) abre direto escondido, mas só para quem usa o Modo designer. */
export function iniciaOculto(argv: string[], config: { designer: boolean }): boolean {
  return config.designer && argv.includes('--oculto');
}

/** Segundos sem mexer no computador para a atualização já baixada reiniciar o app sozinha, mesmo com a janela aberta (pausa curta: a pessoa não está no meio de um movimento). */
const PARADO_PARA_ATUALIZAR_S = 15;

/** Instala a atualização baixada sem perguntar: só no Modo designer, com o app escondido ou com a pessoa longe do computador. */
export function atualizacaoPodeInstalarSozinha(e: { designer: boolean; janelaEmUso: boolean; segundosParado: number; ocupado?: boolean }): boolean {
  if (e.ocupado) return false; // exportando, gerando PDF ou comandando o Corel: espera acabar
  return e.designer && (!e.janelaEmUso || e.segundosParado >= PARADO_PARA_ATUALIZAR_S);
}
