# Teste manual no CorelDRAW — Anúncios 2027 (passo a passo)

Objetivo: confirmar, no CorelDRAW 2025 de verdade, que o macro do anúncio monta o `.cdr` certo: molde copiado para cada capa, arte da capa na página ímpar, arte da contra capa na página par, código de barras do EAN dentro do retângulo da contra capa certa, quadrado do logo intocado e nada distorcido.

> **Importante:** o macro do Corel **não pôde ser rodado** no ambiente de desenvolvimento (lá não existe CorelDRAW). O resto do app tem testes automáticos; o macro, só você consegue testar. Algumas partes foram escritas "no escuro" e podem precisar de ajuste depois do seu teste — principalmente: **pegar uma página específica do PDF**, **copiar as páginas do molde** e **escrever os números embaixo das barras**. Se algo falhar, não tem problema: me mande o que está pedido em "Se der errado" e eu corrijo.

---

## O que preparar antes

1. O app já atualizado (com a aba **Anúncios**, no Modo designer). Você vai receber o instalador (ou a pasta do app pronto) **direto do Claude**, junto com este passo a passo — ele ainda não está publicado na atualização automática. Instale/abra essa versão antes de começar.
2. O molde em `C:\MOLDE\MOLDE.cdr` (o mesmo de sempre, com 2 páginas: capa e contra capa; na contra capa, embaixo e no centro, o **quadrado** do logo e o **retângulo** do código de barras).
3. Arquivos de teste (podem ser artes velhas, qualquer uma serve):
   - um PDF com **2 páginas**;
   - um PDF com **6 páginas**;
   - um PDF com **3 páginas**;
   - **4 imagens** (PNG ou JPG).
4. Para o **Teste P**, o mesmo PDF de 6 páginas serve. Estes EANs **de teste** (são válidos, mas inventados; use só para testar):
   `7891234567895`, `7891234567901`, `7891234567918`, `7891234567925`, `7891234567932`, `7891234567949`.
5. Na aba Anúncios, use sempre a categoria **TESTE** e a subcategoria **SUB** (você cria as duas no **Teste S**, logo abaixo, antes do Teste 1), para não misturar com as artes de verdade. Por isso as pastas de teste ficam em `TESTE\SUB\Teste 1` etc. No fim, apague a pasta `TESTE` inteira e a pasta `TESTE SEM` (do Teste S).
6. Um celular com um app que lê código de barras (por exemplo o **Google Lens**, ou qualquer app "leitor de código de barras" da loja do celular).

---

## Passo 0 — Colocar o macro novo dentro do CorelDRAW (uma vez só)

O Corel guarda os macros num lugar chamado **GlobalMacros**. Lá já existe um módulo chamado **MKP** (o do botão "Abrir no molde"). Vamos trocar esse módulo pelo novo, que tem tudo o que o antigo tinha **mais** os macros do anúncio.

1. **Pegar o arquivo novo do macro.**
   1. Use o arquivo `MKP.bas` que o Claude te enviou. Salve ele na pasta **Downloads**, **sem abrir**.
      - **Resultado esperado:** o arquivo `MKP.bas` está na pasta **Downloads**.
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

## Teste S — Subcategoria (sem precisar do Corel)

Na aba Anúncios, depois da **Categoria** existe a lista **Subcategoria**: ela mostra as pastas que já existem dentro da categoria escolhida. Neste teste você só cria pastas e o `.txt`; o Corel não é usado (pode estar fechado).

1. Abra a aba **Anúncios**, escolha uma plataforma, abra a lista **Categoria** e escolha **Nova categoria…**. Crie a categoria **TESTE**.
   - **Resultado esperado:** a categoria TESTE fica escolhida. Por alguns instantes a lista Subcategoria mostra **"Carregando…"** e os botões de criar ficam apagados; depois ela libera.
2. Olhe a lista **Subcategoria**. Como a pasta TESTE ainda está vazia (sem pastas dentro), ela fica liberada mostrando **"Sem subcategoria"** (a arte iria direto dentro da categoria).
3. Clique na lista.
   - **Resultado esperado:** as opções são **"Sem subcategoria"** e, por último, **"Nova subcategoria…"**.
4. Escolha **Nova subcategoria…**, digite **SUB** e clique em **OK**.
   - **Resultado esperado:** a lista recarrega e **SUB** já fica escolhida. Se digitar um nome repetido ou com caracteres proibidos, aparece uma mensagem de erro amigável; **Cancelar** fecha o bloco sem criar nada.
5. Solte o **PDF de 2 páginas**, dê o nome de arte **Teste S1**, preencha o título e a capa. Deixe o EAN vazio. Repare que, sem EAN, o botão grande passa a se chamar **Criar como pendente** (e fica liberado), e o **Só criar a pasta e o .txt** também funciona.
6. Olhe o quadro **"Será criado"**.
   - **Resultado esperado:** o caminho termina em `…\TESTE\SUB\Teste S1`.
7. Clique em **Só criar a pasta e o .txt**.
   - **Resultado esperado:** cria a pasta `TESTE\SUB\Teste S1`. Abra o `Teste S1.txt` no Bloco de Notas: logo **depois da linha `Categoria:`** vem a linha **`Subcategoria: SUB`**.
   - **Atenção:** como o EAN ficou vazio, essa arte também nasce **pendente** (tem um `pendente.json` na pasta) e aparece como card na seção **Pendentes**. Para limpar: apague a pasta `Teste S1` (ou conclua o card com um EAN de teste). O mesmo vale para o **Teste S2** e para o **Teste 7b**.
8. Clique em **Fazer outro anúncio**.
   - **Resultado esperado:** plataforma, categoria **TESTE** e subcategoria **SUB** continuam escolhidas.
9. Agora a categoria TESTE tem uma pasta dentro (a SUB). Troque a categoria para qualquer outra categoria que já exista e volte para TESTE.
   - **Resultado esperado:** a lista Subcategoria agora começa com **"Escolha a subcategoria…"** e enquanto você não escolher uma, os botões de criar ficam **apagados**. Ao escolher **SUB**, os botões liberam.
10. Teste a categoria sem subpastas: crie uma categoria nova chamada **TESTE SEM**. Ela fica escolhida sozinha depois de criada. Solte o PDF de 2 páginas, nome **Teste S2**, e clique em **Só criar a pasta e o .txt** (deixando a lista em **"Sem subcategoria"**).
    - **Resultado esperado:** o "Será criado" mostra `…\TESTE SEM\Teste S2` (sem subcategoria) e a arte nasce direto em `TESTE SEM\Teste S2`. O `Teste S2.txt` **não** tem a linha `Subcategoria:`.
11. Troque para outra categoria e volte para **TESTE SEM**.
    - **Resultado esperado:** a lista Subcategoria **não** mostra **Teste S2** (o app reconhece que é uma arte, não uma subcategoria) e continua em **"Sem subcategoria"**, com os botões liberados (depois de preencher o resto).
    - Observação: uma pasta de arte **antiga**, feita fora do app e **sem** o arquivo `.txt` com o nome dela nem as subpastas `Corel` ou `Arte` dentro, ainda apareceria na lista como se fosse subcategoria. Se isso acontecer com alguma, é só não escolher essa.

---

> **Se repetir um teste:** antes, apague o `.cdr` que tenha sobrado (inteiro ou pela metade) da pasta **`Corel`** daquele teste — ou apague a pasta do teste inteira e crie de novo. O app nunca apaga nem sobrescreve um `.cdr` que já existe.

## Teste 1 — PDF de 2 páginas (1 capa)

1. Com o Corel **aberto** (pode estar vazio), abra o app → Modo designer → aba **Anúncios**.
2. Solte o **PDF de 2 páginas** na área de soltar arte.
   - **Resultado esperado:** aparece **1 linha** de variação.
3. Escolha uma plataforma, a categoria **TESTE** e a subcategoria **SUB** (criadas no Teste S), dê o nome de arte **Teste 1**, preencha o título, a capa e o EAN `7891234567895`.
4. Clique em **Criar pasta e arquivos**.
   - **Resultado esperado no app:** o título **"Concluído"**, a linha **"Arquivo .cdr montado no Corel"** e a linha **"Capa 1: montada, código de barras em 97% do tamanho padrão."** (o número pode ser outro; o normal é ficar entre 80% e 200%). Se ficar fora disso, o título passa a ser **"Concluído com avisos"** e aparece mais uma linha **"Aviso: Capa 1: Código de barras abaixo de 80%…"** (ou "acima de 200%"). Isso não é erro do teste: só anote o número.
5. Olhe o Corel.
   - **Resultado esperado:** abriu um documento chamado **Teste 1.cdr** com **2 páginas**:
     - **Página 1:** o molde com a arte da página 1 do PDF, encaixada sem esticar.
     - **Página 2:** o molde com a arte da página 2 do PDF e, **dentro do retângulo** de baixo, o **código de barras preto** com os números `7 891234 567895` embaixo (o primeiro número sozinho à esquerda, depois dois grupos de 6).
     - Nada esticado ou achatado; as barras não saem do retângulo.
6. Abra a pasta `TESTE\SUB\Teste 1` no Explorador de Arquivos.
   - **Resultado esperado:** o `Teste 1.txt` solto na pasta e três subpastas: **`Arte`** (o PDF e as imagens SVG da arte), **`Codigo de barras`** (o código de barras em SVG) e **`Corel`** (o `Teste 1.cdr`). O `montar.txt` fica em `Corel` só enquanto o Corel trabalha: **quando o Corel termina bem, o app apaga o `montar.txt`**. Então, no fim de um teste que deu certo, a pasta `Corel` tem só o `.cdr`.
   - **Na tela do app:** ao clicar em criar, aparece a **lista de passos**, que vai marcando cada etapa (pasta, arte, códigos de barras, Corel); no fim o título é **"Concluído"**. As **imagens dos códigos de barras** aparecem no resultado **depois de criar** (não há prévia antes), e os arquivos SVG ficam na pasta `Codigo de barras`.
7. **Durante o teste, anote:** apareceu alguma janela do Corel perguntando algo (por exemplo "Importar PDF" ou "texto como texto/curvas")? Se apareceu, clique **OK** e anote quantas vezes apareceu.

## Teste 2 — PDF de 6 páginas (3 capas)

1. Na aba Anúncios, solte o **PDF de 6 páginas**. Nome da arte **Teste 2**.
   - **Resultado esperado:** **3 linhas** de variação.
2. Use os EANs `7891234567901`, `7891234567918` e `7891234567925` (um em cada linha, nessa ordem).
3. Clique em **Criar pasta e arquivos**.
   - **Resultado esperado no app:** título **"Concluído"** (se alguma porcentagem sair do normal, **"Concluído com avisos"**) e três linhas **"Capa 1: montada, código de barras em …%"**, **"Capa 2: …"** e **"Capa 3: …"**, cada uma com a porcentagem.
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
   - **Resultado esperado:** o app cria a pasta e o `.txt` (confira no Explorador), mostra o título **"Concluído com avisos"**, avisa que **abriu o CorelDRAW com o molde** e mostra o botão **"Montar no Corel agora"** embaixo do resultado. A mensagem **não** deve falar do botão "Abrir no molde (Corel)" (esse botão é da aba MKP, não desta).
3. Espere o Corel abrir **por inteiro** (uns 30 segundos, sem mexer). Clique em **Montar no Corel agora**.
   - **Resultado esperado:** o título muda para **"Concluído"**, aparece **"Arquivo .cdr montado no Corel"** e o **Teste 5.cdr** é montado como no Teste 1.
   - Depois de montar, o botão **Montar no Corel agora** some (não precisa mais dele).
   - Se o Corel ainda não tinha terminado de abrir, o app pode pedir de novo para esperar: espere mais um pouco e clique outra vez no mesmo botão.

## Teste 6 — Corel aberto, com o molde já aberto

1. No Corel, abra `C:\MOLDE\MOLDE.cdr` (Arquivo → Abrir) e deixe ele aberto.
2. No app, monte um anúncio novo (PDF de 2 páginas, nome **Teste 6**) e clique em **Criar pasta e arquivos**.
   - **Resultado esperado:** o **Teste 6.cdr** é montado como no Teste 1.
3. Feche tudo no Corel **sem salvar** o que perguntar do molde. Abra de novo `C:\MOLDE\MOLDE.cdr`.
   - **Resultado esperado:** o molde continua **limpo** (2 páginas, sem arte, sem código de barras). **O molde original nunca pode ser alterado.**

## Teste 7 — Plano B: macro AnuncioDaPasta (sem o app)

> **Importante:** quando o Corel termina bem, o app **apaga o `montar.txt`**. Por isso o Teste 7 só funciona com uma pasta em que o `montar.txt` ainda existe: uma em que o Corel **falhou ou foi fechado no meio** (ou uma pasta antiga com `_corel\montar.txt`). Para criar essa situação: no app, monte o anúncio **com o Corel fechado** (ou feche o Corel assim que o app mandar montar). O app avisa que não montou o `.cdr`, e o `montar.txt` fica na pasta `Corel`.

1. **Feche o `Teste 1.cdr` no Corel** (se ele estiver aberto; não precisa salvar). Se a pasta `TESTE\SUB\Teste 1\Corel` ainda tiver o `Teste 1.cdr`, apague-o (ou mova para outro lugar). **Confira que o `montar.txt` está na pasta `Corel`**; se não estiver, refaça o teste com um anúncio novo em que o Corel falhou, como explicado acima.
2. Feche o app. Com o Corel aberto, rode o macro **AnuncioDaPasta**:
   - Jeito 1: **Alt + F11** → na esquerda, **GlobalMacros → Modules → MKP** (duplo clique) → clique em qualquer lugar **dentro** da parte `Sub AnuncioDaPasta()` → aperte **F5**.
   - Jeito 2: menu **Ferramentas → Scripts → Executar script…** → em "Macros em", escolha **GlobalMacros** → escolha **MKP.AnuncioDaPasta** → **Executar**.
3. Abre uma janela para escolher um arquivo. Entre na pasta `TESTE\SUB\Teste 1\Corel` e escolha **montar.txt**. (Também funciona escolher a pasta `Teste 1`, ou a pasta `Corel`. Em pastas antigas, o macro procura em `_corel` se não achar em `Corel`.)
   - Se em vez da janela aparecer uma caixinha pedindo um caminho: cole o caminho da pasta `Teste 1` (clique na barra de endereço do Explorador, copie e cole) e clique **OK**.
4. **Resultado esperado:** o Corel monta o **Teste 1.cdr** de novo, igual ao do Teste 1, e mostra a mensagem **"Pronto: …Teste 1.cdr"** com a linha `capa1=OK …%`.
5. Rode o **AnuncioDaPasta** de novo na mesma pasta.
   - **Resultado esperado:** mensagem **"Já existe…, vou abrir o que já existe, sem alterar"**, e só abre o `.cdr` (não monta de novo).

## Teste 7b — Capa sem EAN ("Só criar a pasta e o .txt")

1. Na aba Anúncios, solte o **PDF de 2 páginas**. Nome **Teste 7b**. **Deixe o EAN vazio.**
   - **Resultado esperado:** o campo do EAN **não** fica vermelho; embaixo dele aparece, em cinza, **"EAN pendente — a arte será criada como pendente, sem código de barras"**. O botão grande está liberado e se chama **"Criar como pendente"**; o botão **"Só criar a pasta e o .txt"** também fica liberado.
2. Digite um EAN errado (por exemplo `123`).
   - **Resultado esperado:** agora o campo fica **vermelho** e **os dois botões** ficam apagados. Apague o `123` de novo (campo vazio).
3. Clique em **Só criar a pasta e o .txt**.
   - **Resultado esperado no app:** o título **"Concluído"** (não "com avisos"), a frase "Você escolheu só criar a pasta e o .txt: o Corel não foi usado." e o detalhe **"Arte criada como pendente: falta o EAN."**
   - Essa arte agora aparece também como card na seção **Pendentes** (veja o Teste P). Para limpar depois do teste: apague a pasta `Teste 7b` ou conclua o card com um EAN de teste.
4. Abra o `Teste 7b.txt` da pasta no Bloco de Notas.
   - **Resultado esperado:** a linha da variação 1 termina com **`EAN: (pendente)`**.
5. Com o Corel aberto, rode o macro **AnuncioDaPasta** (igual ao Teste 7) e escolha o `montar.txt` da pasta `TESTE\SUB\Teste 7b\Corel` (o Corel precisa ter falhado ou estar fechado na hora de criar, para o `montar.txt` continuar lá, como no Teste 7).
   - **Resultado esperado:** o `Teste 7b.cdr` tem 2 páginas com a arte, e a página 2 tem o retângulo do código de barras **vazio** (sem código). A mensagem do Corel mostra `capa1=OK` **sem** porcentagem.

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

## Teste P0 — Painel: pendentes no topo e formulário que fecha sozinho

1. Abra a aba **Anúncios**.
   - **Resultado esperado:** no topo aparece a seção **Pendentes** (com os cards) e, ao lado de **Atualizar**, o botão azul **Novo anúncio**. O formulário **não** aparece.
2. Clique em **Novo anúncio**.
   - **Resultado esperado:** o formulário abre logo abaixo dos cards e o botão passa a se chamar **Fechar formulário**. (Se você fechar sem criar, o que digitou fica guardado.)
3. Preencha uma arte **sem EAN** (ou sem SKU) e clique em **Criar como pendente**.
   - **Resultado esperado:** o formulário **fecha e fica limpo** (plataforma/categoria continuam escolhidas), a tela sobe para os Pendentes, o card novo aparece **no topo da lista** e abaixo dele a caixa "Concluído… Arte criada como pendente". Para criar outra, clique em **Novo anúncio**; para continuar uma pendente, clique em **Concluir** no card.
   - Se o Corel pedir o clique (aguardando) ou der erro, o formulário **não** fecha, para você ver o aviso e o botão **Montar no Corel agora**.

## Teste P — Anúncio pendente (sem EAN, concluído depois)

Aqui você cria uma arte **sem** o código de barras, ela fica na lista **Pendentes**, e depois você completa os EANs aos poucos. Use o **PDF de 6 páginas** (3 capas) e o nome **Teste P**.

1. **Criar como pendente.** Na aba Anúncios, solte o **PDF de 6 páginas**, nome **Teste P**, escolha **TESTE** e **SUB**, digite um título qualquer e **preencha o SKU das 3 capas** (por exemplo `SKU1`, `SKU2`, `SKU3`); se deixar o SKU vazio, o card também vai listar "SKU da capa 1 (Capa 1)" etc. como faltando. **Deixe os 3 campos de EAN vazios.**
   - **Resultado esperado:** o botão grande troca o nome para **"Criar como pendente"**. Clique nele.
2. **Conferir a pasta.** Abra a pasta `TESTE\SUB\Teste P` no Explorer.
   - **Resultado esperado:** existe o arquivo **`pendente.json`**; existe o `Teste P.cdr` em `TESTE\SUB\Teste P\Corel\Teste P.cdr` (se o Corel estava aberto) **sem** código de barras nas contra capas.
3. **Ver o card.** Na mesma aba, role até a seção **Pendentes** (embaixo). Se não aparecer, clique em **Atualizar**.
   - **Resultado esperado:** um card **Teste P** com a etiqueta **Pendente**, o caminho **"Shopee › TESTE › SUB"** (ou a plataforma que você escolheu) e a frase **"Falta: EAN da capa 1 (Capa 1), EAN da capa 2 (Capa 2), EAN da capa 3 (Capa 3)"** (com o SKU preenchido, só os EANs aparecem; se o SKU ficou vazio, entram também "SKU da capa 1 (Capa 1)" etc. — veja o Teste P2).
4. **EAN errado.** No card, clique em **Concluir**. Aparecem 3 campos. No da Capa 1 digite `123`.
   - **Resultado esperado:** o campo fica vermelho com **"EAN inválido: confira os 13 dígitos"** e o botão **Salvar** fica apagado. Digite agora o `7891234567895` na Capa 1 e repita o mesmo número na Capa 2: aparece **"EAN repetido"** e o botão continua apagado. Apague o da Capa 2.
5. **Concluir só uma capa (parcial).** Com `7891234567895` só na Capa 1, clique em **Salvar**.
   - **Resultado esperado:** **no topo da lista** Pendentes (acima do card, não dentro dele) aparece uma caixa com **"Código de barras gerado."**, **"Ainda faltam 2 capas (o card continua aqui)."** e a orientação do Corel. O card **continua** na lista e agora diz que faltam só a **Capa 2** e a **Capa 3**.
6. **Concluir o resto.** Clique em **Concluir** de novo.
   - **Resultado esperado:** só aparecem os campos da **Capa 2** e da **Capa 3** (a Capa 1 não aparece mais). Digite `7891234567901` e `7891234567918` e clique em **Salvar**.
   - **Resultado esperado:** o card **Teste P some** da lista e, **no topo da lista**, aparece uma **caixa verde** com **"Código de barras gerado."**, **"Nada mais falta: esta arte não está mais pendente."** e a orientação do Corel (se o `.cdr` ainda não foi montado, ela diz **"Monte o .cdr primeiro (Montar no Corel) e depois rode a macro AdicionarEanNoCdr…"**). A caixa fica até você clicar em **Fechar** (ou trocar de aba).
7. **Conferir os arquivos.** Na pasta `TESTE\SUB\Teste P`:
   - **Resultado esperado:** a pasta `Codigo de barras` tem **Capa 1 - EAN.svg**, **Capa 2 - EAN.svg** e **Capa 3 - EAN.svg**; o `Teste P.txt` (Bloco de Notas) tem os 3 EANs nas linhas das variações (nenhuma com "(pendente)"); o `pendente.json` não existe mais (ou não lista mais nenhuma capa); na pasta `Corel` existe o **`ean.txt`**.
8. **Colocar o código no .cdr.** Abra o `Teste P.cdr` no CorelDRAW e rode o macro **AdicionarEanNoCdr**:
   - Jeito 1: **Alt + F11** → na esquerda, **GlobalMacros → Modules → MKP** (duplo clique) → clique em qualquer lugar **dentro** da parte `Sub AdicionarEanNoCdr()` → aperte **F5**.
   - Jeito 2: menu **Ferramentas → Scripts → Executar script…** → em "Macros em", escolha **GlobalMacros** → escolha **MKP.AdicionarEanNoCdr** → **Executar**.
   - **Resultado esperado:** em cada página **par** (2, 4 e 6) o código de barras aparece **dentro do retângulo do EAN**, com um **fundo branco de cantos arredondados**. Uma janela mostra **"Desenhados: 3 / Ja existiam: 0 / Falharam: 0"**. Salve o arquivo (Ctrl + S). O `ean.txt` some da pasta `Corel`.
9. **Rodar de novo.** Com o mesmo `.cdr` aberto, rode **AdicionarEanNoCdr** outra vez (mesmo jeito do passo 8).
   - **Resultado esperado:** como o `ean.txt` já foi apagado, o macro abre uma janela pedindo para escolher o **ean.txt** (título **"Escolha o ean.txt (dentro da pasta Corel da arte)"**). Clique em **Cancelar**. (Se, em vez disso, você escolher um `ean.txt` de **outra** arte, o macro pergunta **"Vou colocar os codigos de barras da arte … no arquivo …. Continuar?"**: responda **Não** e nada é alterado.) Aparece a mensagem **"Nao achei o ean.txt para este .cdr (ele fica em <pasta da arte>\Corel\ean.txt). Conclua o anuncio pendente no app e rode o macro de novo."** Nada é desenhado, então **nada fica duplicado** (confira que ainda há só 1 código por página par).
   - Observação: a frase **"Ja existiam"** só aparece quando o `ean.txt` ainda está lá (por exemplo, se numa rodada outra capa falhou e o arquivo foi mantido). Nesse caso as capas que já tinham código são puladas.
10. **(Opcional) Outro computador.** Em outro computador com o mesmo Drive, abra o app, aba **Anúncios** › **Pendentes**: os mesmos cards aparecem (o pendente fica dentro da pasta da arte, no `pendente.json`).

## Teste P2 — Completar o SKU no card pendente

Use o **PDF de 6 páginas** (3 capas) e o nome **Teste P2**.

1. Solte o PDF, nome **Teste P2**, categoria **TESTE**, subcategoria **SUB**, digite um título, e **deixe o SKU e o EAN das 3 capas vazios**. Clique em **Criar como pendente**.
2. Na seção **Pendentes**, o card **Teste P2** diz **"Falta: EAN da capa 1 (Capa 1), SKU da capa 1 (Capa 1), EAN da capa 2 …"** (EAN e SKU das 3 capas).
3. Clique em **Concluir**.
   - **Resultado esperado:** para **cada capa** aparecem **dois campos**: **"… — EAN (13 dígitos)"** e **"… — SKU"**.
4. Na Capa 1, digite no SKU `A|B`.
   - **Resultado esperado:** o campo fica vermelho com **'O SKU não pode ter o caractere "|"'** e o botão **Salvar** fica apagado. Troque por `SKU1`: o botão libera (pode salvar só o SKU, sem EAN).
5. Digite `SKU1` também no SKU da Capa 2.
   - **Resultado esperado:** aparece um **aviso** "SKU igual ao da capa 1", mas o botão **Salvar continua liberado** (SKU repetido só avisa).
   Troque o da Capa 2 por `SKU2`. Clique em **Salvar**.
6. **Resultado esperado:** caixa no topo: **"Dados salvos."** e **"Ainda faltam 3 capas (o card continua aqui)."** (sem a orientação do Corel, pois nenhum EAN foi salvo). O card agora diz que falta: os **3 EANs** e o **SKU da capa 3**.
7. Abra o `Teste P2.txt` no Bloco de Notas.
   - **Resultado esperado:** a linha 1 tem `SKU: SKU1`, a linha 2 tem `SKU: SKU2`, a linha 3 continua `SKU: (pendente)`; os EANs continuam `(pendente)`.
8. Clique em **Concluir** de novo.
   - **Resultado esperado:** a Capa 1 e a Capa 2 só mostram o campo **EAN**; a Capa 3 mostra **EAN** e **SKU**. Preencha o SKU da Capa 3 (`SKU3`) e os 3 EANs de teste e clique em **Salvar**.
   - **Resultado esperado:** o card **some** e aparece **"Nada mais falta: esta arte não está mais pendente."**
9. **Só o SKU faltando.** Crie uma arte **Teste P3** (PDF de 2 páginas) com **EAN válido** e **SKU vazio** e clique no botão grande.
   - **Resultado esperado:** o botão grande já se chama **"Criar como pendente"** e, no fim, a mensagem diz **"Arte criada como pendente: falta o SKU."**. O card mostra só **"Falta: SKU da capa 1 (Capa 1)"**; em **Concluir** só aparece o campo SKU. Ao salvar, o card some.
10. **Cards antigos.** Um card criado antes desta versão que já listava "SKU da capa …" (como o **FLOR DE ESMALTE**) agora também mostra o campo SKU em **Concluir**.

## Teste W — Wire-o rose gold no mockup de Especificação

1. No app, aba **MKP**, abra um PDF de capa (arraste para a janela). Quando a capa carregar, aparece o painel da direita com **Wire-o**, **Elástico**, **Tassel** e **Imagens a gerar**.
2. Em **Imagens a gerar**, marque **Especificação VT (com envelope)**. A prévia passa para a aba da Especificação VT.
3. No grupo **Wire-o**, escolha **Rose Gold**. Depois, **um de cada vez**, no grupo **Tassel** escolha: **Branco**, **Verde**, **Rosa**, **Azul**, **Nenhum** e **Laranja**.
   - **Resultado esperado em todos os 6 casos:** os **anéis do topo da espiral da esquerda** (os 5 ao lado do tassel) aparecem **cor de cobre**.
4. Agora escolha **Wire-o: Preto** com tassel **Laranja**, e depois **Wire-o: Branco** com tassel **Laranja**.
   - **Resultado esperado:** **nenhum anel de cobre** no topo da espiral; os anéis ficam pretos (ou brancos).

---

## Se der errado

- **O app mostrou "Aviso: Capa 1: sem retangulo"** (ou outro número de capa): o macro não achou o retângulo do código de barras. Conserto rápido no molde:
  1. Abra `C:\MOLDE\MOLDE.cdr`, vá na página 2 e clique **uma vez** no retângulo do código de barras.
  2. Menu **Janela → Janelas de encaixe → Objetos** (ou "Gerenciador de objetos"). O retângulo fica destacado na lista.
  3. Dê dois cliques no nome dele na lista, apague o nome e digite **EAN** (maiúsculo) e Enter.
  4. Salve o molde (Ctrl + S) e repita o teste. Me avise que precisou fazer isso.
- **Qualquer outro erro, ou o resultado ficou diferente do esperado**, me mande:
  1. **Print do Corel** mostrando a página com problema (e da lista de páginas embaixo, onde aparecem "Página 1, Página 2…").
  2. **Print da mensagem** do app (ou da janela do Corel, se ela aparecer).
  3. O arquivo **`montar.txt`** da pasta `Corel` daquele anúncio, se ele ainda existir (o app apaga quando o Corel termina bem; pode anexar o arquivo ou abrir no Bloco de Notas e copiar o texto).
  4. O arquivo **`mockup-resultado.txt`**, se ainda existir: aperte **Windows + R**, digite `%TEMP%` e Enter; procure `mockup-resultado.txt` na pasta que abre. (O app costuma apagar esse arquivo depois de ler; se não estiver lá, tudo bem, o print da mensagem do app serve.)
  5. Se apareceu alguma janela do Corel no meio (por exemplo "Importar PDF"), um print dela.

## O que me enviar no fim

- ✅ / ❌ para o Passo 0 e para cada teste de 1 a 9 (incluindo o 7b), mais o **Teste P**, o **Teste P2** e o **Teste W**.
- A porcentagem que o app mostrou na linha "Capa 1: montada, código de barras em …% do tamanho padrão" (basta uma; os números devem ser iguais em todas as capas do mesmo molde).
- Se apareceu a janela "Importar PDF" (Teste 1, item 7) e quantas vezes.
- Os prints e arquivos de "Se der errado" para cada ❌.
