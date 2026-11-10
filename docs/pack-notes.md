# Notas do pacote do mockup

Gerado por `python tools/export_pack.py fixtures/MKP_2025.psd pack/`.

## Os 3 pontos da seção 7 da spec

1. **Grupo "ATIVAR COM WIREO ROSE".** É o que desenha os anéis de cobre sobre o tassel. Sem ele, o wire-o rose gold aparece quase branco; com ele, aparece cobre. Com wire-o preto, ligar o grupo cobre os anéis pretos com cobre, o que está errado. Regra no pacote: `when: {wireo: "rose-gold"}`. Nenhuma combinação de cores ficou sem camada, então `unavailable` é uma lista vazia.
2. **Contra capa.** Esconder o grupo "CONTRA CAPA" não muda o resultado final (diferença máxima de 1 em 255 por canal). Fica fora do pacote.
3. **Ordem de empilhamento.** O pacote usa a ordem do PSD, de baixo para cima. O teste de fidelidade da Task 4 confere contra a composição do PSD.

## Diferenças em relação ao que a spec supunha

- **Opacidades.** O PSD guarda opacidade de 0 a 255, não de 0 a 100. O brilho vale 31/255 (cerca de 12%), o color-burn do elástico preto vale 97/255 (cerca de 38%) e a sombra vale 128/255 (cerca de 50%). O pacote grava a opacidade já convertida para 0–1.
- **Máscara na capa.** A capa tem uma máscara de camada (704×1159 px, na posição 231, 21). O pacote traz a máscara em `layers/mascara-arte.png` (campo `artMask`) e o motor aplica depois de deformar a arte.
- **Efeitos de camada.** Algumas camadas (elásticos, parte do wire-o) têm sombra projetada, sombra interna e relevo. O script lê essas camadas já com os efeitos aplicados, pelo psd-tools, com 40 px de folga para a sombra que passa da borda. Camadas lidas assim ficam com opacidade 1.0 no pacote, porque o psd-tools já aplicou a opacidade nelas. O relevo (BevelEmboss) pode não ser reproduzido com exatidão pelo psd-tools: só o gabarito feito no Photoshop mostra se isso importa.
