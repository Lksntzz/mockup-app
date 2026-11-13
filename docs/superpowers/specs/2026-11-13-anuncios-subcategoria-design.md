# Anúncios 2027 — Subcategoria (design curto)

Complementa `2026-11-12-anuncios-2027-design.md` e `2026-11-13-anuncios-organizacao-design.md`.

## Intenção
Dentro de cada categoria (ex.: AGENDAMENTO) existem pastas de **tipo de arte** (Manicure, Nail Designer, Pet…), e as artes ficam dentro delas. O designer quer escolher esse tipo na tela. Exemplo dito por ele: `AGENDAMENTO \ MANICURE \ TOQUE ROSE`, em que Manicure é a subcategoria e TOQUE ROSE é uma arte de manicure.

## Desenho (aprovado na conversa)
- Uma terceira lista, **Subcategoria**, logo depois de Categoria. Ao escolher a categoria, o app lê as pastas dentro dela. Trocar plataforma ou categoria recarrega e limpa a escolha.
- Última opção "Nova subcategoria…", igual à "Nova categoria…" que já existe: o designer digita o nome e o app cria a pasta.
- Caminho: `Anúncio 2027 \ Plataforma \ Categoria \ Subcategoria \ <arte>`; o quadro "Será criado" e a criação da pasta seguem esse caminho.
- **Obrigatória quando a categoria tem pastas dentro** (decisão do autor, a ser conferida pelo designer). Se a categoria não tem nenhuma pasta, a arte vai direto na categoria, como hoje.
- O `.txt` da arte ganha a linha `Subcategoria: <nome>` logo depois de `Categoria:`, só quando há subcategoria.

## Não-objetivos
- Mais de um nível de subcategoria; mover ou reorganizar pastas antigas; distinguir "pasta de arte" de "subcategoria" (o app lê o que existe; pastas de teste soltas dentro da categoria, como um TOQUE ROSE antigo, aparecem na lista).

## Abordagens consideradas
Só uma faz sentido: ler as subpastas reais do disco, como já é feito com plataformas e categorias. Lista fixa no código foi descartada porque o designer cria categorias e tipos novos com frequência.
