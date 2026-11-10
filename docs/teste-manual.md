# Teste manual no Windows (passo a passo)

Objetivo: confirmar, num Windows "limpo" (sem Node, sem Photoshop obrigatório, sem nada de programação instalado), que o app instala, abre o PDF, troca as cores e exporta os PNGs corretos.

> **Importante:** o instalador `.exe` **não pôde ser gerado no ambiente onde o app foi desenvolvido** (ele é Linux e o instalador do Windows precisa do programa Wine). O que foi verificado lá: o app empacotado abre, acha o pacote do mockup, lê o PDF, troca cores e exporta 5 PNGs 1200×1200. O que **só você consegue verificar** é a instalação no Windows em si. Por isso este teste existe.

---

## Parte A — Gerar o instalador (uma vez só, num computador com Windows)

Precisa de um computador Windows com internet. Esta parte é a mais "técnica"; se preferir, peça a alguém de TI para fazer só a Parte A.

1. Instale o **Node.js 22 (LTS)**: entre em https://nodejs.org, baixe o botão "LTS", rode o instalador e vá clicando em "Next" até o fim.
   - **Resultado esperado:** ao final, abrir o menu Iniciar → digitar `cmd` → Enter → digitar `node --version` e ver algo como `v22.x.x`.
2. Copie a pasta do projeto `mockup-agenda` para o Windows (por exemplo para `C:\mockup-agenda`).
3. Abra o menu Iniciar, digite `cmd`, Enter. Na janela preta digite:
   ```
   cd C:\mockup-agenda
   npm install
   ```
   - **Resultado esperado:** demora alguns minutos e termina sem a palavra `ERR!` em vermelho. Avisos amarelos (`WARN`) podem ser ignorados.
4. Ainda na mesma janela:
   ```
   npm run dist
   ```
   - **Resultado esperado:** ao final aparece a pasta `C:\mockup-agenda\release` com o arquivo **`Mockup-da-Agenda-Setup-0.1.0.exe`** (deve ter algumas dezenas a poucas centenas de MB; o Electron embute o navegador Chromium).
   - **Se aparecer erro:** copie o texto inteiro da janela e me envie.

---

## Parte B — Teste no Windows limpo

Use, se possível, um computador (ou usuário) que **nunca teve** o app, o Node nem as pastas do projeto. Tenha à mão o `CAPAS.pdf` e uma pasta vazia chamada `Teste` na Área de Trabalho.

### 1. Instalar
1. Dê dois cliques em `Mockup-da-Agenda-Setup-0.1.0.exe`.
2. **Provável aviso azul "O Windows protegeu o computador" (SmartScreen).** Isso acontece porque o instalador não tem assinatura digital paga (é normal para um app interno). Clique em **"Mais informações"** → **"Executar assim mesmo"**.
3. Siga o instalador (Avançar → Instalar → Concluir).
   - **Resultado esperado:** um atalho **"Mockup da Agenda"** aparece na Área de Trabalho e no menu Iniciar.

### 2. Abrir o app
1. Dê dois cliques no atalho.
   - **Resultado esperado:** abre uma janela com título "Mockup da Agenda" e uma área vazia pedindo para abrir um PDF. Nenhuma tela de erro.

### 3. Abrir o `CAPAS.pdf`
1. Clique em **Abrir PDF** (ou arraste o `CAPAS.pdf` para dentro da janela).
   - **Resultado esperado:** uma barra de progresso rápida e a mensagem **"5 capas carregadas."** A lista à esquerda mostra **5 capas** (as páginas 1, 3, 5, 7 e 9 do PDF — as páginas pares, que são o verso, não aparecem) e a prévia grande mostra a agenda com a arte da capa 1.

### 4. Cores diferentes em 2 capas
1. Com a **capa 1** selecionada, escolha: Wire-o **Rose-gold**, Elástico **Rosa**, Tassel **Rosa**.
   - **Resultado esperado:** a prévia muda na hora (em menos de 1 segundo); com rose-gold, os anéis ficam cor de cobre.
2. Clique na **capa 2** na lista.
   - **Resultado esperado:** ela está com as cores iniciais (Wire-o Preto, Elástico Preto, Tassel Branco), **não** as da capa 1.
3. Na capa 2 escolha: Wire-o **Branco**, Elástico **Azul**, Tassel **Verde**.
   - **Resultado esperado:** só a capa 2 muda; ao voltar na capa 1 ela continua rosa.
4. Se alguma combinação não existir no mockup, o app deve avisar com uma mensagem clara e **não** quebrar.

### 5. "Copiar estas cores para todas as capas"
1. Selecione a capa 1 e clique em **Copiar estas cores para todas as capas**.
   - **Resultado esperado:** mensagem "Cores copiadas para todas as capas." Ao clicar nas capas 2, 3, 4 e 5, todas estão com Rose-gold / Rosa / Rosa.

### 6. Exportar
1. Deixe a capa 1 em Rose-gold/Rosa/Rosa e a capa 2 em Branco/Azul/Verde (refaça o passo 4.3 se precisar).
2. Clique em **Exportar** e escolha a pasta `Teste` da Área de Trabalho.
   - **Resultado esperado:** barra de progresso "Exportando 1 de 5… 5 de 5" e depois "5 mockups exportados em …".
3. Abra a pasta `Teste`.
   - **Resultado esperado:** 5 arquivos: `CAPAS_capa-01.png` até `CAPAS_capa-05.png`, nenhum arquivo terminando em `.parcial.png`.
4. Clique com o botão direito em um PNG → **Propriedades → Detalhes**.
   - **Resultado esperado:** dimensões **1200 x 1200**.
5. Clique em **Exportar** de novo e escolha a mesma pasta.
   - **Resultado esperado:** o Windows/app pergunta **"5 arquivos já existem nessa pasta. Substituir?"**. Clique em **Cancelar** → nada muda ("Exportação cancelada. Nada foi gravado.").

### 7. Comparar com o Photoshop (o teste mais importante)
1. Abra o `MKP_2025.psd` no Photoshop, coloque a arte da capa 1 no objeto inteligente e deixe as **mesmas cores** da capa 1 exportada (veja `docs/gabaritos.md` para o passo a passo e os nomes).
2. Exporte do Photoshop em 1200×1200 e coloque lado a lado com `CAPAS_capa-01.png`.
   - **Resultado esperado:** visualmente iguais. Diferenças aceitáveis: arestas ligeiramente mais suaves ou brilho levemente diferente no relevo da capa.
   - **Anote** qualquer diferença que você notar (sombra mais fraca, cor do elástico, anel de cobre, borda da arte). Me mande print dos dois lado a lado.

### 8. Arquivo que não é PDF
1. Clique em **Abrir PDF** e escolha um arquivo `.txt` ou uma imagem (ou arraste um para a janela).
   - **Resultado esperado:** mensagem em vermelho **"Esse arquivo não é um PDF."**. As 5 capas continuam na tela; o app não fecha.

### 9. Fechar e reabrir
1. Feche o app e abra de novo pelo atalho.
   - **Resultado esperado:** abre vazio normalmente, sem erro.

---

## O que me enviar

- ✅ / ❌ para cada passo de 1 a 9.
- Prints de qualquer mensagem de erro (da janela do app ou do instalador).
- Para o passo 7: os dois PNGs (do app e do Photoshop).
