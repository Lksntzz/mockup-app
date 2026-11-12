const RESERVADO = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAXIMO = 80;

/** Deixa o texto digitado usável como nome de pasta no Windows, sem nunca sair da pasta da categoria. */
export function nomeDePastaSeguro(entrada: string): { nome: string; alterado: boolean } {
  const original = String(entrada ?? '').trim();
  const limpar = (t: string) => t.replace(/[\s.]+$/, '').trim();
  let nome = original
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/ {2,}/g, ' ');
  nome = nome.replace(/\.{2,}/g, '-');
  nome = limpar(nome);
  if (RESERVADO.test(nome)) nome = `${nome} -`;
  if (nome.length > MAXIMO) nome = limpar(nome.slice(0, MAXIMO));
  return { nome, alterado: nome !== original };
}

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export function mesmoNome(a: string, b: string): boolean {
  return normalizar(a) === normalizar(b);
}
