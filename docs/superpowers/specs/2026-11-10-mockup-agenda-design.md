# App de Mockup da Agenda — Especificação de Design

Data: 2026-11-10
Status: aguardando revisão do usuário

## 1. Objetivo

Aplicativo Windows que gera o mockup padrão da empresa a partir de um PDF de capas. O usuário abre o PDF, escolhe as cores de **wire-o**, **elástico** e **tassel** para cada capa e exporta uma imagem de mockup por capa.

Quem usa: o usuário e, eventualmente, colegas. Não é necessário ter Photoshop instalado.

Critério de sucesso: o mockup exportado fica visualmente igual ao que o Photoshop gera a partir do `MKP_2025.psd`, para qualquer combinação de cores válida.

## 2. Entradas conhecidas

**PSD de referência (`MKP_2025.psd`, 1200×1200 px):**

- Camadas de cor já prontas e separadas:
  - Wire-o: Rose Gold, Branco, Preto (3 opções).
  - Elástico: Branco, Rosa, Azul, Verde, Laranja, Preto (6 opções).
  - Tassel: Verde, Azul, Rosa, Branco (4 opções).
- A capa é um objeto inteligente ("TROCA A CAPA", 1772×2480 px) colocado com **perspectiva de 4 cantos**. Cantos lidos do PSD (x, y em pixels do mockup): superior esquerdo (214,8; 75,7), superior direito (934,7; 16,1), inferior direito (952,2; 1180,0), inferior esquerdo (221,8; 1131,8).
- A camada "NÃO MEXER 01" tem sombra (modo Multiplicar, cerca de 50%) e brilho (cerca de 12%) que ficam por cima da arte. O PSD guarda opacidade de 0 a 255: sombra 128, brilho 31.
- O elástico preto usa uma camada extra no modo Color Burn (cerca de 38%; valor 97 de 255).
- A capa tem uma máscara de camada (704×1159 px na posição 231, 21) que recorta a arte depois de deformada. Algumas camadas de elástico e de wire-o têm sombra e relevo (efeitos de camada), que o pacote traz já aplicados.
- Os grupos "CONTRA CAPA" (objeto inteligente de 1246×1849 px), "MARCA D'ÁGUA" e "ATIVAR COM WIREO ROSE" existem no PSD. Os dois primeiros não entram no app; o terceiro é uma regra a verificar (ver seção 7).

**PDF de exemplo (`CAPAS.pdf`):** 10 páginas A4, uma imagem de 1055×1491 px (cerca de 180 ppi) por página, com borda preta fina e margem branca. Páginas ímpares são as frentes (capas); páginas pares são os versos e são **ignoradas** pelo app.

## 3. Decisões tomadas

| Tema | Decisão |
|---|---|
| Plataforma | Electron (TypeScript), instalador para Windows 10/11 64 bits |
| Páginas usadas | Somente as ímpares (1, 3, 5, ...). PDF de N páginas gera ceil(N/2) capas |
| Cores | Escolhidas **por capa** (wire-o, elástico, tassel). Botão "Copiar estas cores para todas as capas" |
| Cores iniciais de cada capa | Wire-o preto, elástico preto, tassel branco (combinação visível no PSD) |
| Saída | Um PNG 1200×1200 por capa, com o fundo do PSD, numa pasta escolhida pelo usuário |
| Nome do arquivo | `NOMEDOPDF_capa-01.png`, `NOMEDOPDF_capa-02.png`, ... |
| Contra capa | Fora do escopo. Verso nunca aparece no mockup |
| Fora do escopo da v1 | Vários modelos de produto, vista de trás, marca d'água automática, editar a arte no app, lembrar escolhas entre sessões, exportar em tamanho maior que 1200 px |

## 4. Arquitetura

Cinco blocos, cada um com uma responsabilidade e uma interface clara:

1. **Pacote do mockup.** Pasta com as camadas do PSD exportadas como PNG e um arquivo `mockup.json` com: ordem de empilhamento, opacidade, modo de mistura de cada camada, lista de cores por acessório (com o caminho das camadas de cada cor) e os 4 cantos da capa. Gerado uma vez por um script de desenvolvimento (Python + psd-tools), que **não** faz parte do app instalado. Trocar de modelo no futuro significa trocar o pacote.
2. **Leitor de PDF.** Abre o PDF, seleciona as páginas ímpares, renderiza cada uma como imagem e recorta a borda preta e a margem branca. Entrega uma lista de imagens de capa.
3. **Motor de composição.** Entrada: imagem da capa, cores escolhidas, pacote. Passos: deformar a arte para os 4 cantos (perspectiva calculada em código, na CPU, para dar o mesmo resultado na prévia, na exportação e nos testes), empilhar as camadas na ordem do `mockup.json` respeitando opacidade e modo de mistura (Normal, Multiplicar e Color Burn, implementados no próprio motor), entregar a imagem. **A prévia e a exportação usam o mesmo motor.**
4. **Tela.** Janela única com três áreas: lista de capas à esquerda (miniaturas com o status das cores), prévia grande no centro, painel de cores à direita (3 seletores de bolinhas coloridas, botão "Copiar estas cores para todas", botão "Exportar").
5. **Exportador.** Escolha de pasta, geração de um PNG por capa, confirmação antes de sobrescrever.

Dependências entre blocos: Tela usa Leitor de PDF, Motor e Exportador. O Motor usa o Pacote. O Leitor de PDF e o Pacote não dependem de ninguém.

## 5. Fluxo de uso

1. Clicar em "Abrir PDF" ou arrastar o arquivo para a janela.
2. O app mostra uma barra de progresso, carrega as capas e seleciona a primeira com as cores iniciais.
3. Para cada capa: escolher wire-o, elástico e tassel e ver a prévia mudar na hora.
4. Clicar em "Exportar", escolher a pasta e receber um PNG por capa.

## 6. Tratamento de erros

- PDF com número ímpar de páginas: a última página vira capa e a miniatura mostra "sem verso". Não trava.
- PDF com 1 página: gera 1 capa.
- Página com proporção diferente da capa (A5, cerca de 0,71): aviso amarelo na miniatura. A arte é encaixada sem esticar.
- Arquivo que não é PDF ou PDF corrompido: mensagem clara e o app continua aberto.
- PDF grande (o de exemplo tem 47 MB): barra de progresso durante o carregamento.
- Exportar para um arquivo que já existe: pergunta antes de substituir.

## 7. Itens a verificar no Módulo 1 (pacote do mockup)

Estes pontos dependem de olhar o PSD com mais cuidado e viram critérios de aceitação do módulo:

1. **Regra do grupo "ATIVAR COM WIREO ROSE".** Descobrir quando ele deve ser ligado (o nome indica wire-o rose gold) e registrar a regra no `mockup.json`. Se alguma combinação de cores não tiver camada pronta no PSD, o app esconde essa opção ou a marca como indisponível, em vez de mostrar um resultado quebrado.
2. **Contra capa.** O grupo "CONTRA CAPA" fica atrás da capa. Se o teste de fidelidade mostrar que alguma parte dele aparece no resultado final (por exemplo, a lateral das páginas à direita), exportar essa parte como imagem fixa no pacote.
3. **Ordem real de empilhamento.** Confirmar a ordem pela comparação com o Photoshop, e não só pela estrutura do arquivo.

## 8. Testes e critérios de aceitação

Regra do projeto: nenhum módulo é dado como pronto sem os testes dele passando, e nenhuma etapa avança sem os critérios da etapa anterior cumpridos.

1. **Fidelidade ao Photoshop.** O usuário exporta 3 combinações do PSD como gabarito, com a mesma capa nas três (ex.: wire-o preto + elástico preto + tassel branco; wire-o rose gold + elástico rosa + tassel rosa; wire-o branco + elástico azul + tassel verde). O app gera as mesmas combinações e uma comparação pixel a pixel confere que a diferença fica dentro de uma tolerância pequena, definida no Módulo 4.
2. **Todas as combinações.** Um teste automático gera as 72 combinações possíveis (3 × 6 × 4), exclui as marcadas como indisponíveis pela regra 7.1 e confere que nenhuma tem camada faltando ou erro.
3. **PDF.** Com `CAPAS.pdf`: 5 capas, borda e margem recortadas, sem arte esticada. Também com PDFs de 9 e de 1 página.
4. **Desempenho.** Abrir o PDF de 47 MB em poucos segundos e trocar uma cor sem atraso perceptível.
5. **Instalação limpa.** Instalar num Windows sem nenhum pré-requisito e executar a lista manual do usuário: abrir o PDF, trocar as cores de 2 capas, exportar, abrir o PNG.

## 9. Ordem de construção

1. Pacote do mockup (script de exportação + `mockup.json` + verificações da seção 7)
2. Leitor de PDF
3. Motor de composição (com o teste de fidelidade)
4. Tela
5. Exportador
6. Instalador e teste em máquina limpa

Cada módulo passa por revisão de arquitetura, implementação, testes, auditoria e aprovação antes de o próximo começar.

## 10. Publicação e segurança

- Nada é publicado ou alterado no GitHub sem autorização explícita do usuário.
- O app funciona offline e não envia os PDFs nem os mockups para nenhum servidor.
- Dependências são mantidas no mínimo e verificadas antes de entrar.

## 11. Riscos conhecidos

- O resultado depende do Motor reproduzir fielmente os modos de mistura do Photoshop; por isso o teste de fidelidade vem antes da tela.
- O instalador do Electron é grande (cerca de 100 MB ou mais). Aceito por ser uma ferramenta interna.
- Mockup de 1200 px pode ser pequeno para alguns usos; ampliar a saída fica para uma versão futura e exige gabaritos maiores.
- A demonstração do fluxo atual no Photoshop não aconteceu. A tela (seção 5) é baseada em suposição e pode ser ajustada quando houver prints.
