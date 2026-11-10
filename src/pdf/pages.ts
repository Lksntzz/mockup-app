/** Páginas que viram capa: as ímpares (1, 3, 5, ...). As pares são o verso e não entram no mockup. */
export function capaPageNumbers(total: number): number[] {
  const paginas: number[] = [];
  for (let n = 1; n <= total; n += 2) paginas.push(n);
  return paginas;
}
