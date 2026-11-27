# Teste manual: ferramenta Converte (v0.22.0)

Este teste é no computador de verdade (Windows), com o app instalado. Leva uns 20 minutos. Anote ao lado de cada passo se deu certo.

**Antes de começar:** tenha à mão o vídeo `IMG_6040.MOV` (o do iPhone, 35,5 MB) e um arquivo de texto qualquer (por exemplo um `.txt` do Bloco de Notas).

## 1. Primeiro uso: aviso do Windows e do antivírus

O instalador não é assinado. Por isso o Windows pode mostrar um aviso na instalação ou na primeira conversão.

1. Instale a versão 0.22.0 (o app se atualiza sozinho; se pedir, clique em "Reiniciar e atualizar").
2. Clique em **Converte** (barra de cima) e converta qualquer vídeo curto.
   - **Resultado esperado:** converte sem aviso. Se o SmartScreen ou o antivírus reclamar do `ffmpeg.exe`, **anote o texto exato e tire uma foto da tela**: é o ponto mais provável de problema neste recurso.
3. Veja o tamanho do instalador novo na página de versões do GitHub. **Antes ele tinha 130 MB; esperado entre 160 e 170 MB.** Anote o número.

## 2. Trocar de ferramenta e voltar

1. Na aba **MKP**, abra um PDF de capas e selecione a Capa 2.
2. Clique em **Converte** (botão no alto, ao lado do nome do app).
   - **Resultado esperado:** as abas MKP, Histórico, Cliente, Anúncios e Personalizar **somem** e aparece só a tela do Converte.
3. Clique em **MKP**.
   - **Resultado esperado:** volta exatamente como estava, na mesma aba e com a mesma capa selecionada.
4. Feche o app e abra de novo. **Resultado esperado:** abre na última ferramenta usada.

## 3. Converter o IMG_6040.MOV para MP4

1. Em **Converte**, arraste `IMG_6040.MOV` para a caixa pontilhada (ou clique em **Escolher vídeo**).
   - **Resultado esperado:** aparece uma linha como `IMG_6040.MOV · HEVC + AAC · 1440×2560 · 26 s · 35,5 MB`, e as opções de formato, com **MP4 já marcado**.
2. Deixe **Original** em "Tamanho do resultado" e veja a linha "Tamanho estimado: cerca de … MB".
3. Clique em **Converter**.
   - **Resultado esperado:** barra de progresso com **porcentagem** e "faltam cerca de … s". No fim: **Pronto: IMG_6040.mp4 (… MB)**. Esperado perto de 22 MB e uns 30 segundos a 1 minuto, conforme o computador.
4. Clique em **Abrir a pasta**. **Resultado esperado:** abre o Explorer com o `IMG_6040.mp4` selecionado, **ao lado do original**, e o `.MOV` continua lá, intacto.
5. Abra o `IMG_6040.mp4` no seu player. **Resultado esperado:** toca com imagem **e som**, na vertical.

## 4. Converter de novo (nunca sobrescreve)

1. Converta o mesmo vídeo para MP4 outra vez.
   - **Resultado esperado:** cria `IMG_6040 (1).mp4`. O primeiro arquivo não muda. Faça uma terceira vez: `IMG_6040 (2).mp4`.

## 5. Tamanho máximo

1. Com o `IMG_6040.MOV` aberto, digite **8** no campo "Máximo de … MB".
   - **Resultado esperado:** o botão "Máximo de" fica marcado e **Original/Médio/Pequeno desmarcam**. Aparece um **aviso amarelo** de que a qualidade vai cair, e o botão Converter continua ativo.
2. Converta. **Resultado esperado:** o arquivo final fica **menor que 8 MB**. Abra e veja se a imagem está aceitável.
3. Digite **0,2**. **Resultado esperado:** aviso **vermelho** dizendo que é pequeno demais, e o botão **Converter fica desativado**.
4. Apague o campo e deixe "Máximo de" marcado. **Resultado esperado:** "Digite um tamanho máximo maior que zero." e Converter desativado.

## 6. Só o áudio (MP3) e outros formatos

1. Marque **MP3 — só o áudio**. **Resultado esperado:** os níveis passam a mostrar a qualidade do áudio (192, 128 e 96 kbps). Converta e toque o `.mp3`.
2. Converta para **WebM** e para **MOV** e abra os dois. **Resultado esperado:** abrem e tocam.

## 7. Cancelar no meio

1. Converta o `IMG_6040.MOV` para WebM (o mais lento) e, com a barra em 20% ou mais, clique em **Cancelar**.
   - **Resultado esperado:** o botão muda para "Cancelando…", a barra some e a tela volta ao estado de antes, **sem mensagem de erro**.
2. Abra a pasta do vídeo. **Resultado esperado:** **não sobrou nenhum arquivo pela metade** (nada novo além dos que você já tinha).

## 8. Arquivo que não é vídeo

1. No Bloco de Notas, crie um texto e salve como `falso.txt`. No Explorer, **renomeie para `falso.mov`**.
2. Arraste para o Converte. **Resultado esperado:** mensagem vermelha "Não consegui ler este arquivo como vídeo." e **nenhuma opção de conversão**.

## 9. Nome com acento, espaço e símbolo

1. Copie o vídeo e renomeie para `Vídeo do João & Maria [final].mov`.
2. Converta para MP4. **Resultado esperado:** cria `Vídeo do João & Maria [final].mp4` ao lado, tocando normalmente.

## 10. Vários arquivos de uma vez

1. Selecione dois vídeos no Explorer e arraste juntos para o Converte.
   - **Resultado esperado:** aparece "Converto um vídeo por vez; usei o primeiro." e só o primeiro é aberto.

## 11. Janela estreita

1. Diminua a janela do app até uns 700 px de largura (puxando a borda).
   - **Resultado esperado:** nada passa da borda, nem na barra de cima nem na tela do Converte. Com o **Modo designer** ligado, a barra de cima pode quebrar em duas linhas; isso é esperado.

## 12. Licenças

1. No rodapé do Converte, clique em **Licenças**.
   - **Resultado esperado:** painel dizendo que o ffmpeg é software livre (GPL), aberto como programa separado, com a versão do pacote (**5.3.0**) e três botões. Cada botão abre o site correspondente no navegador.

## 13. Atualização não interrompe a conversão

1. Quando houver uma versão nova publicada, inicie uma conversão longa (WebM do `IMG_6040.MOV`).
   - **Resultado esperado:** o app **não reinicia sozinho** no meio; a atualização espera a conversão terminar.

## Se algo falhar

Tire uma foto da tela com a mensagem e anote qual passo foi. Não tente consertar o arquivo no meio do teste.
