/** Decide se fechar a janela deve só esconder o app (continua vigiando a Pasta 1 e alertando). */
export function deveEsconderAoFechar(config: { designer: boolean }, saindo: boolean): boolean {
  return config.designer && !saindo;
}

/** O app iniciado com o Windows (--oculto) abre direto escondido, mas só para quem usa o Modo designer. */
export function iniciaOculto(argv: string[], config: { designer: boolean }): boolean {
  return config.designer && argv.includes('--oculto');
}
