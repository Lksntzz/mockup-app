# Teste manual: Agenda aberta (versão 0.23.0)

Antes de tudo: abra um PDF de capas normalmente (aba **Novo**), como você já faz. Você precisa também do PDF do miolo, por exemplo o `miolo.pdf`, que tem uma página A4 deitada com as duas páginas lado a lado (segunda página do arquivo).

## 1. A caixa nova
1. No painel da direita, em **Imagens a gerar**, procure **Agenda aberta (miolo)** e marque.
   - **Resultado esperado:** aparecem abaixo dela: botão **Escolher PDF do miolo…**, campo da página (já com **2**), campo **Título** (já com "Visão semanal completa"), caixa **Seta apontando para a agenda** marcada e o botão **Ver prévia da agenda aberta**.
2. Desmarque a caixa.
   - **Resultado esperado:** essas opções somem.

## 2. Escolher o miolo e ver a prévia
1. Marque de novo, clique em **Escolher PDF do miolo…** e escolha o `miolo.pdf`.
   - **Resultado esperado:** aparece o nome do arquivo com "(2 páginas)" e o campo da página fica em **2**.
2. Clique em **Ver prévia da agenda aberta** (leva alguns segundos).
   - **Resultado esperado:** abre uma janela com a agenda aberta: uma página de cada lado, argolas pretas no meio, o título em cima, a seta turquesa apontando para a agenda e nenhuma coluna do miolo coberta pelas argolas.
   - Confira a **fonte do título**: no Windows deve sair fina (Segoe UI Light). Se sair feia ou grossa, me avise e diga qual.
3. Clique em **Fechar**.

## 3. Título e seta
1. Apague o título e desmarque a seta, clique em **Ver prévia**.
   - **Resultado esperado:** a agenda aparece sozinha, centralizada, sem título e sem seta.
2. Escreva outro título (ex.: "Planner aberto") e marque a seta de novo.
   - **Resultado esperado:** o título novo aparece centralizado em cima.

## 4. Erros que devem aparecer em vermelho
1. Sem escolher o PDF do miolo, clique em **Finalizar** com a agenda aberta marcada.
   - **Resultado esperado:** "Escolha o PDF do miolo para a agenda aberta." e **nada é gerado** (a pasta MKP nem é criada).
2. Escolha o miolo e coloque **9** na página.
   - **Resultado esperado:** "Escolha uma página do miolo de 1 a 2."
3. Coloque **1** na página (no `miolo.pdf` é a que tem só o título) e veja a prévia.
   - **Resultado esperado:** sai uma imagem com o título do miolo repetido nas duas páginas, sem erro.

## 5. Finalizar
1. Deixe só **Agenda aberta** marcada (desmarque Frente) e clique em **Finalizar**.
   - **Resultado esperado:** um arquivo `NOME-DO-PDF_agenda-aberta.png` na pasta **MKP**, 1200 x 1200, igual à prévia.
2. Marque também **Frente** e finalize de novo.
   - **Resultado esperado:** pergunta se pode substituir o `_agenda-aberta.png` que já existe; os PNGs das capas saem como sempre.

## O que não está nesta versão
- Só wire-o **preto**.
- A caixa Agenda aberta, o PDF do miolo e o título **não ficam salvos** no Histórico nem no rascunho: ao reabrir um trabalho, é preciso escolher o miolo de novo.
- O miolo é recuado (cerca de 11% menor no `miolo.pdf`) para não ficar debaixo dos furos; se o texto pequeno ficar difícil de ler, o certo é o miolo ter margem de lombada maior na própria arte.

## O que me enviar
- ✅ / ❌ para cada passo.
- Print da prévia e do PNG final; print de qualquer erro.
