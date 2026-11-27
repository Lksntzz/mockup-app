# Ferramenta "Converte" (vídeo) e menu de duas ferramentas — desenho

Data: 2026-11-27 · App: Mockup da Agenda (Electron + TypeScript, Windows) · Dono: Lucas (designer, leigo em programação)

## Intenção

O Lucas recebe vídeos em formatos que os marketplaces e outros programas não aceitam bem (hoje: `.MOV` de iPhone em HEVC, vertical 1440×2560, 26 s, 37 MB). Ele quer converter dentro do próprio app: arrastar o vídeo, o app diz que formato é, oferece as conversões possíveis, e permite **reduzir o tamanho**. Para isso o app ganha uma segunda **ferramenta** na barra de cima: **MKP** (tudo o que existe hoje, sem mudar por dentro) e **Converte** (novo).

Por quê: evitar abrir outros programas ou sites (que enviam o vídeo para fora) e ter o MP4 pronto para anúncio sem sair do app.

## Metas

- Barra de cima com duas ferramentas: **MKP** e **Converte**. As abas atuais (MKP, Histórico, Cliente, Anúncios, Personalizar, engrenagem) aparecem só dentro da ferramenta MKP e funcionam como hoje, incluindo a regra de que Cliente/Anúncios/Configuração são do Modo designer.
- Converte aceita **qualquer vídeo que o ffmpeg consiga ler** (MOV, AVI, MKV, WMV, FLV, 3GP, WebM, MP4, MTS…), por arrastar e soltar ou por botão "Escolher vídeo".
- Ao receber o arquivo, mostra: nome, contêiner, codec de vídeo e de áudio, resolução, quadros por segundo, duração e tamanho.
- Saídas: **MP4 (H.264 + AAC)** (padrão, marcado como "o mais aceito"), **WebM (VP9 + Opus)**, **MOV (H.264 + AAC)**, **só o áudio (MP3)**.
- Tamanho (vale para as saídas com vídeo): **Original** (qualidade alta, mesma resolução), **Médio**, **Pequeno**, ou **Máximo de N MB**, em que o app calcula a qualidade para caber. Os níveis e o "máximo em MB" existem juntos; escolher um desmarca o outro.
- Mostra uma **estimativa** do tamanho final antes de converter, **barra de progresso com porcentagem e tempo restante**, botão **Cancelar**, e no fim o tamanho real e "Abrir a pasta".
- Salva **ao lado do original** e **nunca sobrescreve**: se já existir `nome.mp4`, usa `nome (1).mp4`.
- Tudo roda no computador do Lucas; nenhum vídeo sai da máquina.

## Não metas

- Converter imagens, GIF, áudio solto, ou editar vídeo (cortar, juntar, legendas).
- Converter vários arquivos ao mesmo tempo ou em fila. Um vídeo por vez; se vários forem soltos, o app usa o primeiro e avisa.
- Mexer no conteúdo atual das abas do MKP.
- Servidor, conta, nuvem ou qualquer serviço pago.

## Anti-metas (seria falha mesmo funcionando)

- O instalador ficar muito maior sem o Lucas saber (hoje 130 MB; ffmpeg deve acrescentar algo como 30–40 MB, **medir e informar**).
- Sobrescrever ou apagar o vídeo original, ou deixar um MP4 pela metade depois de cancelar ou de erro.
- O app se atualizar sozinho e reiniciar no meio de uma conversão.
- Prometer um tamanho máximo impossível sem avisar a perda de qualidade.
- Commitar o binário do ffmpeg no repositório público.

## Restrições

- Só planos gratuitos; repositório **público**: nada de binários grandes, chaves ou dados de negócio no Git.
- JavaScript/TypeScript, Electron, esbuild, vitest. Testes (`npm test`) devem passar.
- Publicação como sempre: só envia ao GitHub com "pode enviar" do Lucas, com a versão aumentada e conferindo os dois processos.
- O app roda em PCs Windows de trabalho, possivelmente simples (sem placa de vídeo boa).
- Licença: o ffmpeg que inclui libx264 é GPL. O app mostra o aviso e o link do código do ffmpeg numa tela "Sobre/Licenças" ou no rodapé da ferramenta. O código do app roda o ffmpeg como programa separado (não o incorpora).

## Alternativas consideradas

Mecanismo de conversão:

1. **Levar o ffmpeg dentro do app (escolhida).** Funciona com qualquer formato, inclusive HEVC. Custo: instalador maior e aviso de licença.
2. Só o navegador embutido (WebCodecs): sem peso extra, mas depende do Windows de cada PC ler HEVC e codificar H.264; falharia em alguns PCs. Descartada.
3. Serviço online: envia o vídeo para fora, tem limite/custo. Descartada.
4. Só trocar o invólucro MOV→MP4 com código próprio: serviria só para H.264. O vídeo de teste do Lucas é HEVC, então não resolve o caso real. Descartada como solução principal (o ffmpeg faz isso sozinho quando o vídeo já é compatível: copia sem reconverter).

Navegação: duas camadas (**ferramentas** em cima, **abas** da ferramenta MKP embaixo), conforme o Lucas pediu. Escolhida.

## O que o Lucas decidiu

- A estrutura: ferramenta **MKP** reunindo as abas atuais e ferramenta **Converte**.
- Só vídeo por enquanto.
- Aceita qualquer formato, identifica e oferece as conversões, com opção de reduzir tamanho; níveis prontos **e** "máximo em MB", os dois.
- O mecanismo ffmpeg (aprovado implicitamente ao pedir "qualquer formato"; a aprovação final vem com este desenho).

## Decisões minhas (para o Lucas conferir)

- A aba atual "MKP" continua com esse nome dentro da ferramenta MKP (não renomear).
- O app abre na última ferramenta usada.
- MP4 é o padrão; sem áudio no original é tratado normalmente (sai sem áudio).
- Se o vídeo já é H.264 + AAC e o Lucas escolhe MP4 + Original, copia sem reconverter (segundos, sem perda).
- Rotação do iPhone (vídeo gravado em pé) é respeitada: o MP4 sai na mesma orientação que o original.
- Quando a pasta do original não permite gravar (somente leitura, rede), o app pergunta onde salvar.
- **Converte fica disponível para todos**, não só para o Modo designer (só Cliente, Anúncios e Configuração continuam do designer).
- **Original** = qualidade alta: copia sem reconverter só quando a saída é MP4 ou MOV e o vídeo já é H.264 com áudio AAC; qualquer outro caso reconverte com CRF baixo (em torno de 20 a 23, calibrar com o vídeo de teste).
- **Aviso de qualidade** no "máximo em MB": abaixo de cerca de 0,04 bit por pixel por quadro. **Recusa**: quando a taxa de vídeo calculada ficar abaixo de cerca de 80 kbit/s. São números iniciais; quem constrói pode ajustar, mantendo a regra (avisar antes, recusar só o impossível).
- O app guarda a última ferramenta na mesma configuração do usuário que já guarda as outras preferências.
- **Licenças**: um link "Licenças" no rodapé da ferramenta Converte, que abre um texto com o aviso do ffmpeg (GPL) e o link do código-fonte do ffmpeg e do pacote usado.
- O instalador **já não é assinado** hoje (sem certificado, por causa do plano gratuito). O ffmpeg novo pode, em alguns PCs, acionar o aviso do SmartScreen ou do antivírus; o roteiro de teste manual inclui conferir isso e o Lucas é avisado.
- O atualizador é o `electron-updater` pelo GitHub Releases (já existe); o instalador maior é baixado de forma diferencial quando possível. Não há limite de tamanho definido pelo Lucas além de "medir e informar".

## O que fica para quem constrói

- **Primeiro passo de quem constrói: conferir** que o ffmpeg escolhido (pacote `ffmpeg-static` ou outro) traz os codificadores `libx264`, `libvpx-vp9`, `libopus`, `libmp3lame` e `aac`. Se faltar algum, tirar essa saída da lista (WebM e/ou MP3) e avisar o Lucas em vez de trocar de pacote sem perguntar. **Isto ainda não foi verificado.**
- Como empacotar o ffmpeg: pacote `ffmpeg-static` (baixado na hora de construir, não commitado) e fora do `asar` (`asarUnpack`/`extraResources`), caminho resolvido em desenvolvimento e instalado.
- Identificar o vídeo lendo a saída de `ffmpeg -i` (o pacote não traz o `ffprobe`), ou adicionar outro pacote se for mais simples.
- Progresso via `-progress pipe:1` e a duração lida do arquivo.
- Valores exatos de Médio e Pequeno (resolução máxima, CRF), calibrados com o vídeo de teste `IMG_6040.MOV` (37 MB → ~23 MB em MP4 H.264, CRF 23, `preset veryfast`, 32 s num PC de 2 núcleos); Médio deve ficar claramente menor que Original e Pequeno menor que Médio.
- Cálculo do "máximo em MB": taxa de bits de vídeo = (MB × 8 × 1024² × margem de segurança − bits de áudio) ÷ duração; uma ou duas passagens a critério de quem constrói, desde que o resultado fique **abaixo** do máximo pedido. Quando a taxa por pixel resultante for muito baixa, avisar "a qualidade vai cair bastante" antes de converter; quando for impossível (menor que o áudio), recusar com mensagem clara.
- Estimativa de tamanho antes de converter (pode ser aproximada; deixar claro que é estimativa).
- Cancelamento: encerrar o processo e apagar o arquivo parcial.
- Espaço em disco: avisar se não houver espaço para o resultado estimado.
- Caminhos com acento, espaço e `&` (usar lista de argumentos, nunca montar comando em texto).
- O atualizador (`instalarSeOcioso`) deve considerar "ocupado" enquanto há conversão.
- Estado da ferramenta atual guardado na configuração do usuário; aria-pressed e foco de teclado nas duas camadas de abas.
- Testes automáticos das partes puras (leitura do `ffmpeg -i`, cálculo de taxa de bits, nome sem colisão, montagem dos argumentos, regra de qual aba aparece em qual ferramenta); roteiro de teste manual em `docs/teste-manual-anuncios.md` ou arquivo próprio.
- Atualizar o mapa/notas do projeto se houver (`docs/`), e o aviso de licença.
