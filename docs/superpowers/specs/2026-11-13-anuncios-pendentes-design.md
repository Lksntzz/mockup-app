# Anúncios pendentes (criar sem EAN e concluir depois) — Design

## Intenção
O designer faz o MKP (arte, .cdr) primeiro e só depois registra no GS1 para obter o EAN. Hoje "Criar pasta e arquivos" exige EAN e o "Só criar a pasta e o .txt" não monta o .cdr nem lembra que faltam dados. Quer criar a pasta com os arquivos e o .cdr SEM depender do EAN, ver a arte como card "Pendente" no app e, quando voltar com o EAN, concluir mostrando só o que falta; ao concluir o card some.

## Metas
- Criar a arte completa (pasta, Arte/, .txt, Corel/montar.txt, .cdr montado) com EAN vazio em uma ou mais capas.
- Lista de cards "Pendentes" na aba Anúncios, cada um com nome da arte, caminho (plataforma › categoria › subcategoria) e selo "Pendente" + o que falta.
- Concluir: formulário só com os campos que faltam; gera o SVG do código de barras, atualiza o .txt e coloca o código no .cdr já existente (sem refazê-lo, para não perder o trabalho do MKP).
- O estado pendente vive DENTRO da pasta da arte (`pendente.json`), no Drive: sobrevive a reinstalar e vale em qualquer PC.

## Não-metas
- Não refazer o .cdr ao concluir. Não editar nada além do retângulo EAN/código.
- Nenhum nível novo de pastas. Não mudar o fluxo atual de quem já tem o EAN (continua igual).
- Pendência de SKU entra só como informação ("falta SKU"), sem bloquear.

## Anti-metas (seria falha mesmo funcionando)
- Perder alterações feitas no .cdr; sobrescrever .txt editado à mão; card pendente que nunca some depois de concluído; app lento por varrer o Drive inteiro toda vez.

## Abordagens consideradas
1. Marca `pendente.json` na pasta da arte (ESCOLHIDA pelo usuário): sobrevive a reinstalar, vale em todos os PCs; custo: varredura de pastas.
2. Lista só no computador: simples, mas outros PCs não veem.
3. As duas: mais trabalho e risco de divergir.
Para o .cdr: o usuário escolheu a macro que desenha só o código no .cdr existente (sem refazer).

## Decisões
- `pendente.json` (UTF-8) na raiz da pasta da arte: `{ versao: 1, arte, falta: [{ n, capa, sku, ean: boolean_falta }] }` — por capa n (1..N): nome da capa, se falta EAN, se falta SKU.
- Pendente = alguma capa sem EAN. Criar com EAN vazio passa a ser permitido também no botão principal ("Criar como pendente" quando houver EAN vazio) e monta o .cdr normalmente (a macro já pula o código quando `ean` é vazio).
- Varredura: Plataforma › Categoria › [Subcategoria] › Arte, procurando `pendente.json`; leitura em paralelo limitada; uma subpasta é "arte" se tem `pendente.json`, `<nome>.txt` ou Corel/Arte (mesma regra da subcategoria).
- Concluir (app): valida EANs (13 dígitos, GTIN válido, sem repetir entre si nem com os já existentes), grava `Codigo de barras\Capa N - EAN.svg`, troca `EAN: (pendente)` por o EAN na linha N do `.txt` (só essa linha; se não achar a linha, avisa e não mexe), grava `Corel\ean.txt` (linhas `n|ean|mod`, latin1, CRLF) e atualiza `pendente.json`; quando nenhuma capa falta, apaga `pendente.json` (o card some).
- Macro `AdicionarEanNoCdr` (novo, MKP.bas): no documento ativo, lê `<pasta>\Corel\ean.txt`, para cada capa n desenha o EAN na página par 2n (mesmo `DesenharEan`, fundo branco arredondado), pula capas cujo código já existe (marcado por nome de objeto), e apaga `ean.txt` só se tudo deu certo. O app abre o fluxo como o "Montar no Corel": botão "Colocar no Corel" + plano B pela macro.
- Falha de leitura/escrita nunca apaga `pendente.json` antes de tudo concluído (gravar por último).

## Deixado ao implementador
Textos exatos dos cards, ordem dos cards (mais recentes primeiro), nomes internos.
