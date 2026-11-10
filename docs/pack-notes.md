# Notas do pacote do mockup

Gerado por `python tools/export_pack.py fixtures/MKP_2025.psd pack/`.

## Os 3 pontos da seção 7 da spec

1. **Grupo "ATIVAR COM WIREO ROSE".** É o que desenha os anéis de cobre sobre o tassel. Sem ele, o wire-o rose gold aparece quase branco; com ele, aparece cobre. Com wire-o preto, ligar o grupo cobre os anéis pretos com cobre, o que está errado. Regra no pacote: `when: {wireo: "rose-gold"}`. Nenhuma combinação de cores ficou sem camada, então `unavailable` é uma lista vazia.
2. **Contra capa.** CORRIGIDO em 2026-11-10. A conclusão antiga ("não muda o resultado") só valia para a renderização do psd-tools, que **não desenha sombra projetada, sombra interna nem relevo**. No Photoshop a contra capa tem sombra interna (10%) que escurece a lateral das páginas ao lado da capa. Ela agora **entra no pacote** (`contracapa-01`), com a sombra desenhada por `tools/effects.py`.
3. **Ordem de empilhamento.** O pacote usa a ordem do PSD, de baixo para cima. O teste de fidelidade da Task 4 confere contra a composição do PSD.

## Diferenças em relação ao que a spec supunha

- **Opacidades.** O PSD guarda opacidade de 0 a 255, não de 0 a 100. O brilho vale 31/255 (cerca de 12%), o color-burn do elástico preto vale 97/255 (cerca de 38%) e a sombra vale 128/255 (cerca de 50%). O pacote grava a opacidade já convertida para 0–1.
- **Máscara na capa.** A capa tem uma máscara de camada (704×1159 px, na posição 231, 21). O pacote traz a máscara em `layers/mascara-arte.png` (campo `artMask`) e o motor aplica depois de deformar a arte.
- **Efeitos de camada.** Algumas camadas (elásticos, parte do wire-o) têm sombra projetada, sombra interna e relevo. O script lê essas camadas já com os efeitos aplicados, pelo psd-tools, com 40 px de folga para a sombra que passa da borda. Camadas lidas assim ficam com opacidade 1.0 no pacote, porque o psd-tools já aplicou a opacidade nelas. O relevo (BevelEmboss) pode não ser reproduzido com exatidão pelo psd-tools: só o gabarito feito no Photoshop mostra se isso importa.

## Efeitos de camada (sombra projetada, sombra interna, relevo)

O psd-tools só reproduz contorno e sobreposições de cor. `tools/effects.py` desenha os três efeitos que faltavam, com os parâmetros guardados no PSD (opacidade, ângulo, distância, tamanho, contração), nas camadas: contra capa, "Camada 14 copiar" de cada wire-o e as camadas dos elásticos.

Calibração contra os gabaritos do Photoshop (`fixtures/gabaritos/`):
- **Sombra interna:** é máxima na borda e cai em linha reta até `tamanho × 0,35` pixels para dentro. A curva de contorno do PSD **não** é aplicada (com ela o ajuste piorou: erro 3,7 contra 2,3 níveis).
- **Sombra projetada e relevo:** gaussiana (`tamanho × 0,5`) e inclinação por altura. Ainda **não calibrados** contra o Photoshop (os elásticos têm erro residual de 3 a 7 níveis).

Erro médio por região contra os 3 gabaritos (antes → depois): lateral das páginas 7,5 → 2,0 (wire-o rose-gold e branco) e 12,7 → 7,2 (preto); erro total 1,32 / 0,75 / 0,98 → 1,16 / 0,58 / 0,67.

Divergências **sem explicação** (pendentes):
- Elástico: no meio da fita a cor do Photoshop difere da cor crua da camada (rosa: R 213 → 200; azul: G 219 → 208), embora a camada rosa não tenha efeito algum. Não é perfil de cor (testado: Adobe RGB → sRGB piora), nem camada extra de color-burn, nem opacidade de preenchimento.
- Chão no gabarito do preto: a sombra é ~1,35× mais escura que a do app, com razão constante. Suspeita: camada de sombra a mais ligada ao montar o gabarito.
