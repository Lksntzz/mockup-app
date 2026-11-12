# Teste manual no CorelDRAW — Anúncios 2027 (passo a passo)

Objetivo: confirmar, no CorelDRAW 2025 de verdade, que o macro do anúncio monta o `.cdr` certo: molde copiado para cada capa, arte da capa na página ímpar, arte da contra capa na página par, código de barras do EAN dentro do retângulo da contra capa certa, quadrado do logo intocado e nada distorcido.

> **Importante:** o macro do Corel **não pôde ser rodado** no ambiente de desenvolvimento (lá não existe CorelDRAW). O resto do app tem testes automáticos; o macro, só você consegue testar. Algumas partes foram escritas "no escuro" e podem precisar de ajuste depois do seu teste — principalmente: **pegar uma página específica do PDF**, **copiar as páginas do molde** e **escrever os números embaixo das barras**. Se algo falhar, não tem problema: me mande o que está pedido em "Se der errado" e eu corrijo.

---

## O que preparar antes

1. O app já atualizado (com a aba **Anúncios**, no Modo designer).
2. O molde em `C:\MOLDE\MOLDE.cdr` (o mesmo de sempre, com 2 páginas: capa e contra capa; na contra capa, embaixo e no centro, o **quadrado** do logo e o **retângulo** do código de barras).
3. Arquivos de teste (podem ser artes velhas, qualquer uma serve):
   - um PDF com **2 páginas**;
   - um PDF com **6 páginas**;
   - um PDF com **3 páginas**;
   - **4 imagens** (PNG ou JPG).
4. Estes EANs **de teste** (são válidos, mas inventados; use só para testar):
   `7891234567895`, `7891234567901`, `7891234567918`, `7891234567925`, `7891234567932`, `7891234567949`.
5. Na aba Anúncios, use sempre uma categoria nova chamada **TESTE** (botão "Nova categoria…"), para não misturar com as artes de verdade. No fim, apague a pasta `TESTE` inteira.
6. Um celular com um app que lê código de barras (por exemplo o **Google Lens**, ou qualquer app "leitor de código de barras" da loja do celular).

---

## Passo 0 — Colocar o macro novo dentro do CorelDRAW (uma vez só)

O Corel guarda os macros num lugar chamado **GlobalMacros**. Lá já existe um módulo chamado **MKP** (o do botão "Abrir no molde"). Vamos trocar esse módulo pelo novo, que tem tudo o que o antigo tinha **mais** os macros do anúncio.

1. **Baixar o arquivo novo do macro.**
   1. Abra https://github.com/Lksntzz/mockup-app/blob/feature/anuncios-2027/tools/corel/MKP.bas (entre com sua conta do GitHub se pedir).
   2. Clique no botão de **download** (ícone de seta para baixo, "Download raw file"), no canto direito, em cima do código.
      - **Resultado esperado:** o arquivo `MKP.bas` vai para a pasta **Downloads**.
   - **Não abra e não salve** esse arquivo no Bloco de Notas antes de importar (o Bloco de Notas pode trocar a codificação e estragar o macro).
2. **Abrir o editor de macros do Corel.**
   1. Abra o CorelDRAW 2025 (pode ser com um documento qualquer, ou vazio).
   2. Aperte **Alt + F11** (ou menu **Ferramentas → Scripts → Editor do Visual Basic**).
      - **Resultado esperado:** abre uma janela separada, "Microsoft Visual Basic for Applications". À esquerda aparece uma lista (o "Project") com **GlobalMacros (GlobalMacros.gms)**.
3. **Tirar o módulo MKP antigo.**
   1. Na lista da esquerda, clique no **+** ao lado de **GlobalMacros** e depois no **+** de **Modules** (ou "Módulos").
   2. Clique com o botão direito em **MKP** → **Remove MKP…** (ou "Remover MKP…").
   3. Ele pergunta se quer exportar antes de remover: clique **No** (ou "Não").
      - **Resultado esperado:** o MKP some da lista.
4. **Importar o módulo novo.**
   1. Clique com o botão direito em **GlobalMacros** → **Import File…** (ou "Importar arquivo…").
   2. Escolha o `MKP.bas` da pasta **Downloads** → **Abrir**.
      - **Resultado esperado:** o **MKP** aparece de novo em **Modules**.
   - Se aparecer **MKP1** em vez de **MKP**: o antigo não foi removido. Remova os dois (passo 3) e importe de novo.
5. **Conferir se o macro "compila" (se o Corel entende tudo).**
   1. No menu de cima da janela do VBA: **Debug → Compile GlobalMacros** (ou "Depurar → Compilar GlobalMacros").
      - **Resultado esperado:** **nada acontece** (nenhuma mensagem). Isso é o certo.
      - **Se aparecer uma mensagem de erro** (por exemplo "Compile error" ou "Erro de compilação") e uma linha ficar amarela ou azul: **tire um print da janela inteira** e me mande. Não siga para os testes.
6. **Salvar.** Aperte **Ctrl + S** dentro da janela do VBA e feche essa janela (o X dela). Volte ao Corel.

---

## Teste 1 — PDF de 2 páginas (1 capa)

1. Com o Corel **aberto** (pode estar vazio), abra o app → Modo designer → aba **Anúncios**.
2. Solte o **PDF de 2 páginas** na área de soltar arte.
   - **Resultado esperado:** aparece **1 linha** de variação.
3. Escolha uma plataforma, a categoria **TESTE**, dê o nome de arte **Teste 1**, preencha o título, a capa e o EAN `7891234567895`.
4. Clique em **Criar pasta e arquivos**.
   - **Resultado esperado no app:** mensagem de que criou a pasta e montou no Corel, com a capa 1 **OK** e uma porcentagem de ampliação (algo entre 80% e 200%). Se a porcentagem estiver fora disso, o app mostra um aviso amarelo (isso é normal; anote o número).
5. Olhe o Corel.
   - **Resultado esperado:** abriu um documento chamado **Teste 1.cdr** com **2 páginas**:
     - **Página 1:** o molde com a arte da página 1 do PDF, encaixada sem esticar.
     - **Página 2:** o molde com a arte da página 2 do PDF e, **dentro do retângulo** de baixo, o **código de barras preto** com os números `7 891234 567895` embaixo (o primeiro número sozinho à esquerda, depois dois grupos de 6).
     - Nada esticado ou achatado; as barras não saem do retângulo.
6. Abra a pasta `TESTE\Teste 1` no Explorador de Arquivos.
   - **Resultado esperado:** `Teste 1.txt`, `Teste 1.pdf`, `Teste 1.cdr` e a pasta `_corel` (dentro dela, `montar.txt`).
7. **Durante o teste, anote:** apareceu alguma janela do Corel perguntando algo (por exemplo "Importar PDF" ou "texto como texto/curvas")? Se apareceu, clique **OK** e anote quantas vezes apareceu.

## Teste 2 — PDF de 6 páginas (3 capas)

1. Na aba Anúncios, solte o **PDF de 6 páginas**. Nome da arte **Teste 2**.
   - **Resultado esperado:** **3 linhas** de variação.
2. Use os EANs `7891234567901`, `7891234567918` e `7891234567925` (um em cada linha, nessa ordem).
3. Clique em **Criar pasta e arquivos**.
   - **Resultado esperado no app:** capas 1, 2 e 3 **OK**, cada uma com a porcentagem.
4. No Corel, o **Teste 2.cdr** deve ter **6 páginas**:
   - páginas 1, 3 e 5 = capas (páginas 1, 3 e 5 do PDF, nessa ordem);
   - páginas 2, 4 e 6 = contra capas (páginas 2, 4 e 6 do PDF), cada uma com o molde completo (igual à página 2 do molde);
   - **página 2** com o código `7891234567901`, **página 4** com `7891234567918`, **página 6** com `7891234567925` (confira os números escritos embaixo de cada código — **cada EAN tem que estar na contra capa da sua capa**).
5. Confira também: as páginas 3 a 6 têm **todas as linhas e caixas do molde**, na mesma posição das páginas 1 e 2.

## Teste 3 — PDF de 3 páginas (a última capa sem contra capa)

1. Solte o **PDF de 3 páginas**. Nome **Teste 3**.
   - **Resultado esperado:** **2 linhas**.
2. EANs `7891234567932` e `7891234567949`. Clique em **Criar pasta e arquivos**.
3. No Corel, o **Teste 3.cdr** deve ter **4 páginas**:
   - página 1 = página 1 do PDF; página 2 = página 2 do PDF + código `7891234567932`;
   - página 3 = página 3 do PDF; página 4 = **só o molde** (sem arte) **com o código** `7891234567949` no retângulo.

## Teste 4 — Duas imagens e "Adicionar mais"

1. Na aba Anúncios, solte **2 imagens** (a primeira vira a capa, a segunda a contra capa). Nome **Teste 4**.
   - **Resultado esperado:** 1 linha.
2. Clique em **Adicionar mais** e escolha mais 2 imagens.
   - **Resultado esperado:** 2 linhas.
3. EANs `7891234567895` e `7891234567901`. Clique em **Criar pasta e arquivos**.
4. No Corel, o **Teste 4.cdr** deve ter **4 páginas**: imagem 1 na página 1, imagem 2 na página 2 (+ código `7891234567895`), imagem 3 na página 3, imagem 4 na página 4 (+ código `7891234567901`). Imagens encaixadas sem esticar.

## Teste 5 — Corel fechado

1. **Feche o CorelDRAW** por completo.
2. Monte um anúncio novo (PDF de 2 páginas, nome **Teste 5**, EAN `7891234567895`) e clique em **Criar pasta e arquivos**.
   - **Resultado esperado:** o app cria a pasta e o `.txt` (confira no Explorador) e avisa que **abriu o CorelDRAW com o molde**, pedindo para esperar e clicar de novo.
3. Espere o Corel abrir **por inteiro** (uns 30 segundos, sem mexer). Clique de novo no botão que o app indicar.
   - **Resultado esperado:** o **Teste 5.cdr** é montado como no Teste 1.
   - Se o app não tiver um botão para o segundo clique, use o **Teste 7** (plano B) com a pasta `Teste 5` e anote isso.

## Teste 6 — Corel aberto, com o molde já aberto

1. No Corel, abra `C:\MOLDE\MOLDE.cdr` (Arquivo → Abrir) e deixe ele aberto.
2. No app, monte um anúncio novo (PDF de 2 páginas, nome **Teste 6**) e clique em **Criar pasta e arquivos**.
   - **Resultado esperado:** o **Teste 6.cdr** é montado como no Teste 1.
3. Feche tudo no Corel **sem salvar** o que perguntar do molde. Abra de novo `C:\MOLDE\MOLDE.cdr`.
   - **Resultado esperado:** o molde continua **limpo** (2 páginas, sem arte, sem código de barras). **O molde original nunca pode ser alterado.**

## Teste 7 — Plano B: macro AnuncioDaPasta (sem o app)

1. Apague (ou mova para outro lugar) o arquivo `Teste 1.cdr` da pasta `TESTE\Teste 1`. **Deixe** a pasta `_corel` lá.
2. Feche o app. Com o Corel aberto, rode o macro **AnuncioDaPasta**:
   - Jeito 1: **Alt + F11** → na esquerda, **GlobalMacros → Modules → MKP** (duplo clique) → clique em qualquer lugar **dentro** da parte `Sub AnuncioDaPasta()` → aperte **F5**.
   - Jeito 2: menu **Ferramentas → Scripts → Executar script…** → em "Macros em", escolha **GlobalMacros** → escolha **MKP.AnuncioDaPasta** → **Executar**.
3. Abre uma janela para escolher um arquivo. Entre na pasta `TESTE\Teste 1\_corel` e escolha **montar.txt**.
   - Se em vez da janela aparecer uma caixinha pedindo um caminho: cole o caminho da pasta `Teste 1` (clique na barra de endereço do Explorador, copie e cole) e clique **OK**.
4. **Resultado esperado:** o Corel monta o **Teste 1.cdr** de novo, igual ao do Teste 1, e mostra a mensagem **"Pronto: …Teste 1.cdr"** com a linha `capa1=OK …%`.
5. Rode o **AnuncioDaPasta** de novo na mesma pasta.
   - **Resultado esperado:** mensagem **"Já existe…, vou abrir o que já existe, sem alterar"**, e só abre o `.cdr` (não monta de novo).

## Teste 8 — Ler o código de barras com o celular

1. Abra um dos `.cdr` montados (por exemplo o **Teste 2.cdr**), vá na página 2 e aumente o zoom até o código de barras ficar grande na tela (ou imprima a página em 100%).
2. Aponte o app de leitura do celular para o código.
   - **Resultado esperado:** o celular lê **exatamente** `7891234567901` (o EAN dessa capa).
3. Repita nas páginas 4 e 6 (devem dar `7891234567918` e `7891234567925`).
4. Olhe também os números embaixo das barras: estão legíveis, em fonte normal (Arial), e iguais ao que o celular leu?

## Teste 9 — Quadrado do molde intocado

1. Em qualquer `.cdr` montado (por exemplo o **Teste 2.cdr**), vá em cada contra capa (páginas 2, 4 e 6).
   - **Resultado esperado:** o **quadrado** (do logo, ao lado do retângulo do código) está **no mesmo lugar, do mesmo tamanho e vazio**, igual ao da página 2 do `C:\MOLDE\MOLDE.cdr`. O código de barras fica **só** no retângulo, nunca no quadrado.

---

## Se der errado

- **O app disse "capa N: ERRO sem retangulo"**: o macro não achou o retângulo do código de barras. Conserto rápido no molde:
  1. Abra `C:\MOLDE\MOLDE.cdr`, vá na página 2 e clique **uma vez** no retângulo do código de barras.
  2. Menu **Janela → Janelas de encaixe → Objetos** (ou "Gerenciador de objetos"). O retângulo fica destacado na lista.
  3. Dê dois cliques no nome dele na lista, apague o nome e digite **EAN** (maiúsculo) e Enter.
  4. Salve o molde (Ctrl + S) e repita o teste. Me avise que precisou fazer isso.
- **Qualquer outro erro, ou o resultado ficou diferente do esperado**, me mande:
  1. **Print do Corel** mostrando a página com problema (e da lista de páginas embaixo, onde aparecem "Página 1, Página 2…").
  2. **Print da mensagem** do app (ou da janela do Corel, se ela aparecer).
  3. O arquivo **`montar.txt`** da pasta `_corel` daquele anúncio (pode anexar o arquivo ou abrir no Bloco de Notas e copiar o texto).
  4. O arquivo **`mockup-resultado.txt`**, se ainda existir: aperte **Windows + R**, digite `%TEMP%` e Enter; procure `mockup-resultado.txt` na pasta que abre. (O app costuma apagar esse arquivo depois de ler; se não estiver lá, tudo bem, o print da mensagem do app serve.)
  5. Se apareceu alguma janela do Corel no meio (por exemplo "Importar PDF"), um print dela.

## O que me enviar no fim

- ✅ / ❌ para o Passo 0 e para cada teste de 1 a 9.
- A porcentagem de ampliação que o app mostrou (basta uma, os números devem ser iguais em todas as capas do mesmo molde).
- Se apareceu a janela "Importar PDF" (Teste 1, item 7) e quantas vezes.
- Os prints e arquivos de "Se der errado" para cada ❌.
