// Teste de fumaça da janela: abre o app de verdade (Electron + tela virtual), abre um PDF, troca cores,
// tira capturas de tela e imprime o que viu. Uso (Linux):
//   xvfb-run -a node_modules/.bin/electron --no-sandbox tools/smoke.cjs <pdf> <pasta-de-saida>
const { app, dialog, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const [pdf, saida] = process.argv.slice(-2);
fs.mkdirSync(saida, { recursive: true });
// o PDF é copiado para uma pasta própria, para a pasta MKP nascer ao lado dele sem sujar o original
const pastaDoTrabalho = path.join(saida, 'trabalho');
fs.rmSync(pastaDoTrabalho, { recursive: true, force: true });
fs.mkdirSync(pastaDoTrabalho, { recursive: true });
const pdfDoTrabalho = path.join(pastaDoTrabalho, path.basename(pdf));
fs.copyFileSync(pdf, pdfDoTrabalho);
let arquivoDoDialogo = pdfDoTrabalho;
// os dados do operador (histórico) ficam numa pasta do teste, para começar sempre do zero
const pastaDeDados = path.join(saida, 'dados');
fs.rmSync(pastaDeDados, { recursive: true, force: true });
app.setPath('userData', pastaDeDados);
let pastaDoDialogo = null;
dialog.showOpenDialog = async (opcoes) =>
  (opcoes && opcoes.properties && opcoes.properties.includes('openDirectory'))
    ? { canceled: false, filePaths: [pastaDoDialogo] }
    : { canceled: false, filePaths: [arquivoDoDialogo] };

process.env.MOCKUP_RAIZES_BUSCA = '/tmp/smoke-busca/G'; // onde o app procura as pastas do fluxo no teste
process.env.MOCKUP_VIGIA_MS = '1500'; // vigia da Pasta 1 rápido para o teste
require(process.env.MAIN_JS || path.resolve(__dirname, '../dist/main/main.js'));

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const falhas = [];
function conferir(ok, texto) {
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${texto}`);
  if (!ok) falhas.push(texto);
}

app.on('browser-window-created', (_e, win) => {
  const wc = win.webContents;
  wc.on('console-message', (_ev, nivel, msg) => nivel >= 2 && console.log('[console]', msg));
  let roteiroIniciado = false;
  wc.on('did-finish-load', async () => {
    if (roteiroIniciado) return; // recarregar a página (teste de rascunho) não reinicia o roteiro
    roteiroIniciado = true;
    const js = (c) => wc.executeJavaScript(c);
    const ate = async (cond, rotulo, ms = 120000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await js(cond)) return true;
        await espera(200);
      }
      console.log('tempo esgotado esperando:', rotulo, '| mensagem:', await js("document.getElementById('mensagem').textContent").catch(() => '?'));
      return false;
    };
    const foto = async (nome) => fs.writeFileSync(path.join(saida, nome), (await wc.capturePage()).toPNG());
    try {
      conferir(await ate("document.body.dataset.estado === 'vazio'", 'pacote carregado'), 'o pacote do mockup carregou e o app está na tela inicial');
      await foto('1-inicio.png');
      conferir(!(await js("!!document.getElementById('abrir')")), 'não existe mais o botão "Abrir PDF"');
      conferir(await js("document.getElementById('voltar').hidden"), 'na tela inicial não aparece o botão de voltar');
      conferir(await js("document.getElementById('em-andamento').hidden"), 'sem trabalhos em andamento a lista não aparece');

      // clicar na área grande abre a escolha de arquivo
      await js("document.getElementById('zona').click()");
      conferir(await ate("document.body.dataset.estado === 'pronto' && Number(document.body.dataset.previa) >= 1", 'PDF carregado'), 'clicar na área da tela inicial abriu o PDF e mostrou a prévia');
      await foto('2-pdf-aberto.png');
      const n = await js("document.querySelectorAll('#lista .item').length");
      conferir(n === 5, `a lista tem 5 capas (tem ${n})`);
      conferir((await js("document.getElementById('mensagem').textContent")).includes('5 capas'), 'mensagem "5 capas carregadas"');
      conferir(!(await js("document.getElementById('voltar').hidden")), 'trabalhando aparece o botão de voltar ao início');

      const antes = Number(await js('document.body.dataset.previa'));
      await js("document.querySelector('[data-acc=elastico][data-id=rosa]').click()");
      await js("document.querySelector('[data-acc=wireo][data-id=rose-gold]').click()");
      await js("document.querySelector('[data-acc=tassel][data-id=rosa]').click()");
      conferir(await ate(`Number(document.body.dataset.previa) > ${antes}`, 'prévia atualizada'), 'a prévia atualizou depois de trocar as cores');
      await espera(500);
      await foto('3-cores-trocadas.png');

      // tassel laranja: funciona com rose gold (capa 1) e também com wire-o preto (capa 2)
      await js("document.querySelector('[data-acc=tassel][data-id=laranja]').click()");
      await espera(800);
      conferir((await js("document.querySelector('[data-acc=tassel][aria-pressed=true]').dataset.id")) === 'laranja', 'o tassel laranja funciona com wire-o rose gold');
      await foto('3a-tassel-laranja.png');
      await js("document.querySelector('[data-acc=tassel][data-id=rosa]').click()");
      await js("document.querySelectorAll('#lista .item')[1].click()");
      await espera(1500);
      conferir(!(await js("document.querySelector('[data-acc=tassel][data-id=laranja]').disabled")), 'o tassel laranja também está disponível com wire-o preto');
      const cor2 = await js("document.querySelector('[data-acc=elastico][aria-pressed=true]').dataset.id");
      conferir(cor2 === 'preto', `a capa 2 mantém as cores iniciais (elástico ${cor2})`);

      // tirar o elástico e o tassel da capa 1
      await js("document.querySelectorAll('#lista .item')[0].click()");
      await espera(500);
      const antesNenhum = Number(await js('document.body.dataset.previa'));
      await js("document.querySelector('[data-acc=elastico][data-id=nenhum]').click()");
      await js("document.querySelector('[data-acc=tassel][data-id=nenhum]').click()");
      conferir(await ate(`Number(document.body.dataset.previa) > ${antesNenhum}`, 'prévia sem peças'), 'a prévia atualizou ao tirar elástico e tassel');
      await espera(500);
      await foto('3b-sem-elastico-sem-tassel.png');
      conferir((await js("document.querySelector('[data-acc=elastico][aria-pressed=true]').dataset.id")) === 'nenhum', 'o elástico ficou em "Nenhum"');
      await js("document.querySelectorAll('#lista .item')[0].click()");
      await js("document.getElementById('copiar').click()");

      // voltar ao início guarda o trabalho
      await js("document.getElementById('voltar').click()");
      conferir((await js('document.body.dataset.estado')) === 'vazio', 'voltar ao início mostra a tela inicial');
      await foto('4-inicio-com-trabalho.png');
      conferir((await js("document.querySelectorAll('#trabalhos .trabalho').length")) === 1, 'o trabalho aparece em "Em andamento"');
      conferir(await js("document.getElementById('previa').hidden && document.getElementById('painel').hidden"), 'na tela inicial a prévia e o painel somem');

      // abrir de novo o mesmo PDF retoma o trabalho (não lê tudo de novo)
      await js("document.querySelector('#trabalhos .continuar').click()");
      await ate("document.body.dataset.estado === 'pronto'", 'retomar');
      await js("document.querySelectorAll('#lista .item')[3].click()");
      await espera(500);
      const cor4 = await js("document.querySelector('[data-acc=elastico][aria-pressed=true]').dataset.id");
      conferir(cor4 === 'nenhum', `ao continuar, as escolhas (inclusive sem elástico) continuam salvas (elástico da capa 4: ${cor4})`);
      conferir((await js("document.querySelectorAll('#lista .item').length")) === 5, 'ao continuar, as 5 capas continuam lá');

      // arquivo que não é PDF, escolhido na tela inicial
      await js("document.getElementById('voltar').click()");
      arquivoDoDialogo = path.join(saida, 'nao-e-pdf.txt');
      fs.writeFileSync(arquivoDoDialogo, 'isto não é um PDF');
      await js("document.getElementById('zona').click()");
      await ate("document.getElementById('mensagem').classList.contains('erro')", 'erro de PDF');
      const msg = await js("document.getElementById('mensagem').textContent");
      conferir(msg.includes('não é um PDF'), `arquivo que não é PDF mostra mensagem clara ("${msg}")`);
      conferir((await js('document.body.dataset.estado')) === 'vazio', 'depois do erro continua na tela inicial');
      conferir((await js("document.querySelectorAll('#trabalhos .trabalho').length")) === 1, 'o trabalho em andamento não se perdeu');

      // o caminho usado no arrastar: o app lê o PDF pelo caminho
      const lido = await js(`window.mockupApi.lerPdf(${JSON.stringify(pdfDoTrabalho)}).then(a => a.nome + ':' + a.bytes.length)`);
      conferir(lido.startsWith('CAPAS.pdf:') && Number(lido.split(':')[1]) > 1000, `ler o PDF pelo caminho funciona (${lido})`);
      const recusou = await js(`window.mockupApi.lerPdf(${JSON.stringify(arquivoDoDialogo)}).then(() => 'leu', e => e.message)`);
      conferir(recusou.includes('não é um PDF'), 'ler pelo caminho recusa arquivo que não é PDF');

      // concluir: cria a pasta MKP ao lado do PDF e grava lá
      await js("document.querySelector('#trabalhos .continuar').click()");
      await ate("document.body.dataset.estado === 'pronto'", 'retomar para concluir');
      await js("document.getElementById('exportar').click()");
      await ate("!document.getElementById('salvo').hidden", 'conclusão');
      await foto('5-concluido.png');
      const cartao = await js("document.getElementById('salvo').textContent");
      conferir(cartao.includes('Salvo') && cartao.includes('5 mockups'), `aparece o card "Salvo" com a quantidade ("${cartao.replace(/\s+/g, ' ').trim()}")`);
      conferir((await js("document.getElementById('mensagem').textContent")) === '', 'a mensagem do topo é limpa depois de salvar');
      conferir(!/MKP|[\\\\/]/.test(cartao + (await js("document.getElementById('mensagem').textContent"))), 'nenhum caminho de pasta aparece na tela');
      conferir(await js("document.body.dataset.estado") === 'pronto', 'com o card aberto, a arte continua aberta por trás (nada foi descartado)');
      await js("document.getElementById('salvo-ok').click()");
      conferir((await js('document.body.dataset.estado')) === 'vazio' && await js("document.getElementById('salvo').hidden"), 'Terminar fecha o card e volta ao início');

      conferir(await js("document.getElementById('em-andamento').hidden"), 'ao concluir, o trabalho sai de "Em andamento"');
      // operador e histórico
      const operador = await js("document.getElementById('operador').textContent");
      conferir(operador.length > 0, `o topo mostra o operador ("${operador}")`);
      await js("document.getElementById('tab-historico').click()");
      await ate("document.querySelectorAll('#historico-lista .historico-linha').length === 1", 'histórico com 1 trabalho');
      const linhaHist = await js("document.querySelector('#historico-lista .historico-linha').textContent");
      conferir(linhaHist.includes('CAPAS.pdf') && linhaHist.includes('5 capas') && linhaHist.includes('Frente'), `o histórico mostra PDF, capas e imagens ("${linhaHist.replace(/\s+/g, ' ').trim()}")`);
      const arquivoHist = path.join(pastaDeDados, 'usuarios');
      conferir(fs.existsSync(arquivoHist) && fs.readdirSync(arquivoHist).length === 1, 'o histórico fica numa pasta própria do operador');
      await foto('5a-historico.png');
      await js("document.querySelector('#historico-lista .editar').click()");
      await ate("document.body.dataset.estado === 'pronto'", 'editar pelo histórico');
      await js("document.querySelectorAll('#lista .item')[3].click()");
      await espera(500);
      const corHist = await js("document.querySelector('[data-acc=elastico][aria-pressed=true]').dataset.id");
      conferir(corHist === 'nenhum', `Editar reabre o trabalho com as cores salvas (elástico da capa 4: ${corHist})`);
      conferir((await js("document.querySelectorAll('#lista .item').length")) === 5, 'Editar traz as 5 capas de volta');
      await js("document.getElementById('voltar').click()");
      const pastaMkp = path.join(path.dirname(pdfDoTrabalho), 'MKP');
      const nomes = fs.existsSync(pastaMkp) ? fs.readdirSync(pastaMkp).sort() : [];
      conferir(nomes.length === 5 && nomes[0] === 'CAPAS_capa-01.png' && nomes[4] === 'CAPAS_capa-05.png', `criou a pasta MKP ao lado do PDF com os 5 PNGs (${nomes.join(', ')})`);
      const cab = fs.readFileSync(path.join(pastaMkp, nomes[0] || 'x'));
      conferir(cab.readUInt32BE(16) === 1200 && cab.readUInt32BE(20) === 1200 && cab.subarray(1, 4).toString() === 'PNG', 'o primeiro PNG tem 1200×1200');
      conferir(!nomes.some((x) => x.includes('parcial')), 'nenhum arquivo temporário sobrou');
      conferir(fs.existsSync(pdfDoTrabalho), 'o PDF original continua no lugar');
      conferir(!(await js("document.getElementById('exportar').disabled")), 'o botão Concluir voltou a ficar ativo');

      // imagens de especificação: reabre o PDF e marca só VT e sem canguru
      arquivoDoDialogo = pdfDoTrabalho;
      await js("document.getElementById('zona').click()");
      await ate("document.body.dataset.estado === 'pronto'", 'reabrir para a especificação');
      const marcar = (id, v) => js(`(() => { const c = document.getElementById('${id}'); c.checked = ${v}; c.dispatchEvent(new Event('change')); })()`);
      const marcada = (id) => js(`document.getElementById('${id}').checked`);
      conferir((await marcada('saida-frente')) && !(await marcada('saida-vt')) && !(await marcada('saida-sem-canguru')), 'por padrão só a Frente vem marcada');
      await marcar('saida-frente', false);
      conferir(await marcada('saida-frente'), 'não deixa desmarcar a última imagem marcada');
      await marcar('saida-vt', true);
      await marcar('saida-sem-canguru', true);
      await marcar('saida-frente', false);
      conferir(!(await marcada('saida-frente')), 'com outra marcada, dá para desmarcar a Frente');
      await ate("document.getElementById('aba-sem-canguru') && document.getElementById('aba-sem-canguru').getAttribute('aria-pressed') === 'true'", 'prévia da especificação ao marcar');
      conferir((await js("document.querySelectorAll('#abas-lista button').length")) === 4, 'as abas mostram Frente, VT, Sem canguru e Verso');
      const antesSeta = await js('document.body.dataset.previa');
      await js("document.getElementById('aba-anterior').click()");
      await ate(`document.body.dataset.previa !== ${JSON.stringify(antesSeta)}`, 'prévia depois da seta');
      conferir((await js("document.getElementById('aba-vt').getAttribute('aria-pressed')")) === 'true', 'a seta ◀ leva do Sem canguru para a Especificação VT');
      await foto('6a-previa-vt.png');
      await js("document.getElementById('exportar').click()");
      await ate("!document.getElementById('salvo').hidden", 'conclusão com especificação', 240000);
      await foto('6-especificacao.png');
      const cartao2 = await js("document.getElementById('salvo').textContent");
      conferir(cartao2.includes('10 mockups'), `o card conta as 10 imagens de especificação ("${cartao2.replace(/\s+/g, ' ').trim()}")`);
      await js("document.getElementById('salvo-continuar').click()");
      conferir((await js('document.body.dataset.estado')) === 'pronto' && await js("document.getElementById('salvo').hidden"), 'Continuar com esta arte fecha o card e mantém a arte aberta');
      await js("document.getElementById('voltar').click()");
      conferir((await js("document.querySelectorAll('#trabalhos .trabalho').length")) === 1, 'a arte que continuou segue em "Em andamento"');
      const nomes2 = fs.readdirSync(pastaMkp).sort();
      conferir(nomes2.length === 15 && nomes2.includes('CAPAS_capa-01_especificacao-vt.png') && nomes2.includes('CAPAS_capa-05_especificacao-sem-canguru.png'), `gravou VT e sem canguru de cada capa sem mexer nas da frente (${nomes2.length} arquivos)`);
      const cab2 = fs.readFileSync(path.join(pastaMkp, 'CAPAS_capa-01_especificacao-vt.png'));
      conferir(cab2.readUInt32BE(16) === 1200 && cab2.readUInt32BE(20) === 1200, 'a imagem de especificação tem 1200×1200');
      conferir(Buffer.compare(cab2, fs.readFileSync(path.join(pastaMkp, 'CAPAS_capa-01_especificacao-sem-canguru.png'))) !== 0, 'VT e sem canguru são imagens diferentes');

      // verso: a página par do PDF vira o mockup de costas
      await js("document.getElementById('zona').click()");
      await ate("document.body.dataset.estado === 'pronto'", 'reabrir para o verso');
      conferir(!(await js("document.getElementById('aba-verso').disabled")), 'a aba Verso está liberada (o PDF tem páginas pares)');
      const antesDaPrevia = await js('document.body.dataset.previa');
      await js("document.getElementById('aba-verso').click()");
      await ate(`document.body.dataset.previa !== ${JSON.stringify(antesDaPrevia)}`, 'prévia do verso');
      await foto('7-verso.png');
      conferir((await js("document.getElementById('aba-verso').getAttribute('aria-pressed')")) === 'true', 'a aba Verso fica marcada');
      await marcar('saida-verso', true);
      await marcar('saida-vt', false);
      await marcar('saida-sem-canguru', false);
      await marcar('saida-frente', false);
      await js("document.getElementById('exportar').click()");
      await ate("!document.getElementById('salvo').hidden", 'conclusão do verso', 240000);
      const cartao3 = await js("document.getElementById('salvo').textContent");
      conferir(cartao3.includes('5 mockups'), `o card conta as 5 imagens do verso ("${cartao3.replace(/\s+/g, ' ').trim()}")`);
      await js("document.getElementById('salvo-ok').click()");
      const nomes3 = fs.readdirSync(pastaMkp).sort();
      conferir(nomes3.length === 20 && nomes3.includes('CAPAS_capa-01_verso.png') && nomes3.includes('CAPAS_capa-05_verso.png'), `gravou o verso de cada capa (${nomes3.length} arquivos)`);
      conferir(Buffer.compare(fs.readFileSync(path.join(pastaMkp, 'CAPAS_capa-01_verso.png')), fs.readFileSync(path.join(pastaMkp, 'CAPAS_capa-01.png'))) !== 0, 'o verso é diferente da frente');

      // rascunho: fechar/reiniciar o app não perde o trabalho em andamento
      wc.reload();
      await ate("document.body.dataset.estado === 'vazio'", 'app recarregado');
      await espera(600);
      conferir(await js("document.getElementById('em-andamento').hidden"), 'depois de Terminar não sobra rascunho em disco');
      await js("document.getElementById('zona').click()");
      await ate("document.body.dataset.estado === 'pronto'", 'abrir para o rascunho');
      await js("document.querySelector('[data-acc=elastico][data-id=nenhum]').click()");
      await js("document.querySelectorAll('#lista .item')[2].click()");
      await espera(1200); // o salvamento automático espera um instante antes de gravar
      wc.reload(); // simula fechar o app com o trabalho aberto
      await espera(1500);
      await ate("document.body.dataset.estado === 'vazio'", 'app recarregado com rascunho');
      await ate("document.querySelectorAll('#trabalhos .trabalho').length === 1", 'rascunho listado');
      conferir((await js("document.querySelectorAll('#trabalhos .trabalho').length")) === 1, 'depois de reiniciar, o trabalho aberto aparece em "Em andamento"');
      await js("document.querySelector('#trabalhos .continuar').click()");
      await ate("document.body.dataset.estado === 'pronto'", 'continuar o rascunho');
      conferir((await js("document.querySelector('[data-acc=elastico][aria-pressed=true]').dataset.id")) !== undefined, 'continuar abre o trabalho');
      conferir((await js("document.querySelector('#lista .item[aria-current=true] strong').textContent")) === 'Capa 3', 'a capa que estava selecionada volta selecionada');
      await js("document.querySelectorAll('#lista .item')[0].click()");
      conferir((await js("document.querySelector('[data-acc=elastico][aria-pressed=true]').dataset.id")) === 'nenhum', 'a cor escolhida (elástico Nenhum) volta depois de reiniciar');

      // ---- Modo designer: escondido por padrão; liga com 5 cliques na versão ----
      wc.reload();
      await espera(1500);
      await ate("document.body.dataset.estado === 'vazio'", 'app recarregado para o designer');
      conferir(await js("document.getElementById('tab-pasta1').hidden"), 'por padrão a aba Pasta 1 NÃO aparece');
      const recusa = await js("window.mockupApi.clientesListar().then(() => 'permitiu', (e) => String(e.message || e))");
      conferir(recusa !== 'permitiu' && recusa.includes('Modo designer'), `sem o modo designer o app recusa listar a Pasta 1 (${recusa.slice(-60)})`);
      const atalho = "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', shiftKey: true }))";
      const digitarPin = (v) => js(`(() => { const c = document.getElementById('pin-campo'); c.value = '${v}'; document.getElementById('pin-form').requestSubmit(); })()`);
      await js(atalho);
      conferir(await ate("!document.getElementById('tela-pin').hidden", 'pede PIN'), 'Shift+D pede o PIN antes de entrar no Modo designer');
      await digitarPin('0000');
      await espera(2500);
      conferir(await js("document.getElementById('tab-pasta1').hidden"), 'PIN errado não liga o Modo designer');
      await js(atalho);
      await ate("!document.getElementById('tela-pin').hidden", 'pede PIN de novo');
      await js("document.getElementById('pin-cancelar').click()");
      conferir(await js("document.getElementById('tela-pin').hidden"), 'Cancelar fecha a tela do PIN');
      await js(atalho);
      await ate("!document.getElementById('tela-pin').hidden", 'pede PIN outra vez');
      await digitarPin('1411');
      conferir(await ate("!document.getElementById('tela-designer').hidden && document.getElementById('designer-titulo').textContent.includes('Carregando')", 'tela carregando'), 'Shift+D mostra a tela "Carregando modo designer…"');
      await foto('8a-carregando-designer.png');
      conferir(await ate("document.getElementById('designer-titulo').textContent === 'Bem-vindo, LK'", 'boas-vindas'), 'depois de carregar aparece "Bem-vindo, LK"');
      await foto('8b-bem-vindo.png');
      await ate("document.getElementById('tela-designer').hidden", 'tela some');
      conferir(!(await js("document.getElementById('tab-pasta1').hidden")), 'depois das boas-vindas a aba Pasta 1 está liberada');
      // pastas falsas: nada de pastas reais de clientes
      const fluxo = path.join(saida, 'fluxo');
      fs.rmSync(fluxo, { recursive: true, force: true });
      const p1 = path.join(fluxo, '1 AGUARDA ARTE');
      const p2 = path.join(fluxo, '2 APROVAR');
      const cliente = path.join(p1, 'CLIENTE A');
      fs.mkdirSync(cliente, { recursive: true });
      fs.mkdirSync(p2, { recursive: true });
      const largura = 1238, altura = 1562;
      const bmp = Buffer.alloc(largura * altura * 4, 200);
      fs.writeFileSync(path.join(cliente, 'arte.png'), nativeImage.createFromBitmap(bmp, { width: largura, height: altura }).toPNG());
      const achar = '/tmp/smoke-busca/G/Empresa/FLUXO';
      fs.rmSync('/tmp/smoke-busca', { recursive: true, force: true });
      for (const n of ['1 AGUARDA ARTE', '2 APROVAR', '3 AGUARDA IMPRESSÃO', '4 FINALIZADOS']) fs.mkdirSync(path.join(achar, n), { recursive: true });
      await js("document.getElementById('procurar-pastas').click()");
      conferir(await ate("document.getElementById('caminho-pasta1').textContent.endsWith('1 AGUARDA ARTE') && document.getElementById('caminho-pasta4').textContent.endsWith('4 FINALIZADOS')", 'pastas achadas', 20000), 'o botão "Procurar as pastas sozinho" preenche as pastas 1 a 4');
      pastaDoDialogo = p1;
      await js("document.getElementById('escolher-pasta1').click()");
      await espera(400);
      pastaDoDialogo = p2;
      await js("document.getElementById('escolher-pasta2').click()");
      await espera(400);
      await js("document.getElementById('tab-pasta1').click()");
      await ate("document.querySelectorAll('#pasta1-lista .cliente-linha').length === 1", 'cliente listado');
      conferir((await js("document.querySelectorAll('#pasta1-lista .cliente-linha').length")) === 1, 'a Pasta 1 lista o cliente que ainda não tem MKP');
      conferir((await js("document.querySelector('#pasta1-lista .etapa.atual').textContent")).startsWith('1'), 'o cliente da Pasta 1 mostra a etapa 1 marcada na barra');
      conferir((await js("document.querySelector('#pasta1-lista .selo-situacao').textContent")).includes('Arte para fazer'), 'o selo do cliente diz "Arte para fazer"');
      // etapas 3 e 4 e busca nos finalizados
      const p3 = path.join(fluxo, '3 AGUARDA IMPRESSAO');
      const p4 = path.join(fluxo, '4 FINALIZADOS');
      fs.mkdirSync(path.join(p3, 'CLIENTE IMPRIMINDO'), { recursive: true });
      fs.mkdirSync(path.join(p4, 'ANTIGO CLIENTE'), { recursive: true });
      pastaDoDialogo = p3;
      await js("document.getElementById('escolher-pasta3').click()");
      await espera(400);
      pastaDoDialogo = p4;
      await js("document.getElementById('escolher-pasta4').click()");
      await espera(400);
      await ate("document.querySelectorAll('#pasta1-lista .cliente-linha').length === 2", 'cliente da etapa 3');
      conferir(await js("[...document.querySelectorAll('#pasta1-lista .cliente-linha')].some(l => l.textContent.includes('CLIENTE IMPRIMINDO') && l.querySelector('.etapa.atual').textContent.startsWith('3'))"), 'cliente da Pasta 3 aparece com a etapa 3 marcada');
      await js("document.getElementById('busca-finalizados').value = 'antigo'; document.getElementById('buscar-finalizados').click()");
      await ate("document.querySelectorAll('#busca-resultado .cliente-linha').length === 1", 'resultado da busca');
      conferir(await js("document.querySelector('#busca-resultado .etapa.atual').textContent.startsWith('4')"), 'a busca nos finalizados acha o cliente da Pasta 4 com a etapa 4 marcada');
      // alerta "arte para fazer": cliente novo com arte
      await ate("window.mockupApi.designerEstado().then((c) => Array.isArray(c.vistos))", 'vigia registrou os existentes', 30000);
      conferir(await js("document.getElementById('alerta-arte').hidden"), 'os clientes que já existiam não geram alerta');
      const novo = path.join(p1, 'CLIENTE NOVO');
      fs.mkdirSync(novo);
      await espera(2500);
      conferir(await js("document.getElementById('alerta-arte').hidden"), 'pasta nova ainda vazia não gera alerta');
      fs.writeFileSync(path.join(novo, 'arte.jpg'), 'x');
      conferir(await ate("!document.getElementById('alerta-arte').hidden && document.getElementById('alerta-arte-nomes').textContent.includes('CLIENTE NOVO')", 'alerta arte para fazer', 30000), 'chegou a arte numa pasta nova: aparece o alerta "Arte para fazer: CLIENTE NOVO"');
      await foto('8c-alerta.png');
      await js("document.getElementById('alerta-arte-fechar').click()");
      fs.rmSync(novo, { recursive: true, force: true });
      // segundo plano: com o Modo designer ligado, fechar a janela só esconde; o alerta continua chegando
      const janela = require('electron').BrowserWindow.fromWebContents(wc);
      janela.close();
      await espera(500);
      conferir(!janela.isDestroyed() && !janela.isVisible(), 'com o Modo designer ligado, fechar a janela esconde o app em vez de encerrar');
      const segundoPlano = path.join(p1, 'CLIENTE EM SEGUNDO PLANO');
      fs.mkdirSync(segundoPlano);
      fs.writeFileSync(path.join(segundoPlano, 'arte.jpg'), 'x');
      fs.writeFileSync(path.join(segundoPlano, 'capa.cdr'), 'x');
      conferir(await ate("!document.getElementById('alerta-arte').hidden && document.getElementById('alerta-arte-nomes').textContent.includes('SEGUNDO PLANO')", 'alerta em segundo plano', 30000), 'com a janela escondida o alerta "Arte para fazer" continua chegando');
      janela.show();
      await js("document.getElementById('alerta-arte-fechar').click()");
      await js("document.getElementById('tab-pasta1').click()");
      await ate("[...document.querySelectorAll('#pasta1-lista .cliente-linha')].some(l => l.textContent.includes('SEGUNDO PLANO'))", 'cliente em segundo plano na lista');
      conferir(await js("[...document.querySelectorAll('#pasta1-lista .cliente-linha')].find(l => l.textContent.includes('SEGUNDO PLANO')).textContent.includes('Abrir no Corel')"), 'o cliente com .cdr mostra o botão "Abrir no Corel"');
      const recusaAbrir = await js("window.mockupApi.abrirArquivoCliente('/etc/passwd').then((r) => r.motivo || 'abriu')");
      conferir(recusaAbrir !== 'abriu', `o app recusa abrir arquivo fora das pastas de cliente (${recusaAbrir.slice(0, 40)}…)`);
      fs.rmSync(segundoPlano, { recursive: true, force: true });
      const lojaShopee = path.join(p1, 'SHOPEE', 'LOJA SMOKE');
      fs.mkdirSync(lojaShopee, { recursive: true });
      fs.writeFileSync(path.join(lojaShopee, 'arte.png'), 'x');
      await js("document.getElementById('atualizar-pasta1').click()");
      conferir(await ate("[...document.querySelectorAll('#pasta1-lista .cliente-linha')].some(l => l.querySelector('.nome')?.textContent === 'LOJA SMOKE' && l.querySelector('.grupo-chip')?.textContent === 'SHOPEE') && ![...document.querySelectorAll('#pasta1-lista .cliente-linha .nome')].some(n => n.textContent === 'SHOPEE')", 'cliente da SHOPEE na lista'), 'o cliente de dentro da pasta SHOPEE aparece com o nome em cima e a etiqueta SHOPEE (a SHOPEE em si não é cliente)');
      // foto da aba Cliente com vários clientes (para conferir o layout de computador)
      const longo = path.join(p1, 'EXPRESSO LEAOZINHO COM NOME BEM GRANDE PARA TESTAR');
      fs.mkdirSync(path.join(longo, 'MKP'), { recursive: true });
      fs.writeFileSync(path.join(longo, 'MKP', 'x-01.png'), 'x');
      for (const n of ['capa.cdr', 'capa.pdf', 'Cópia_de_segurança_de_capa.cdr', 'WhatsApp Image 2026-11-09 at 13.32.24 (4).jpeg']) fs.writeFileSync(path.join(longo, n), 'x');
      fs.mkdirSync(path.join(p1, 'SHOPEE', 'gabriella.vaz'), { recursive: true });
      fs.writeFileSync(path.join(p1, 'SHOPEE', 'gabriella.vaz', 'br-11134231-820lr-mrg2tox2p3if5d.jpg'), 'x');
      await js("document.getElementById('atualizar-pasta1').click()");
      await ate("document.querySelectorAll('#pasta1-lista .cliente-linha').length >= 4", 'vários clientes na lista');
      await espera(600);
      await foto('10-cliente.png');
      conferir(await js("document.getElementById('tab-novo').getBoundingClientRect().top >= 0 && document.getElementById('tab-novo').offsetParent !== null"), 'o menu MKP / Histórico / Cliente continua visível na aba Cliente');
      // vários arquivos de arte: uma lista para escolher e um botão só; filtros por situação e por nome
      const varias = path.join(p1, 'MUITAS ARTES');
      fs.mkdirSync(varias, { recursive: true });
      for (const n of ['capa.pdf', 'frente.png', 'verso.jpg']) fs.writeFileSync(path.join(varias, n), 'x');
      await js("document.getElementById('atualizar-pasta1').click()");
      await ate("[...document.querySelectorAll('#pasta1-lista .cliente-linha .nome')].some(n => n.textContent === 'MUITAS ARTES')", 'cliente com várias artes');
      const opcoes = await js("(() => { const l = [...document.querySelectorAll('#pasta1-lista .cliente-linha')].find(x => x.querySelector('.nome').textContent === 'MUITAS ARTES'); return [[...l.querySelectorAll('select.cc-select option')].map(o => o.textContent).join(','), [...l.querySelectorAll('button')].filter(b => b.textContent.startsWith('Fazer MKP')).length]; })()");
      conferir(opcoes[1] === 1 && opcoes[0] === 'frente.png,verso.jpg,capa.pdf', `com várias artes aparece uma lista (imagens primeiro, PDF por último) e um botão só (${opcoes.join(' | ')})`);
      await js("[...document.querySelectorAll('#filtro-chips .chip')].find(b => b.textContent.startsWith('Prontas')).click()");
      conferir(await js("![...document.querySelectorAll('#pasta1-lista .cliente-linha .nome')].some(n => n.textContent === 'MUITAS ARTES') && [...document.querySelectorAll('#pasta1-lista .cliente-linha .nome')].some(n => n.textContent.startsWith('EXPRESSO'))"), 'o filtro "Prontas" esconde quem ainda precisa de arte e mostra quem está pronto');
      await js("[...document.querySelectorAll('#filtro-chips .chip')].find(b => b.textContent.startsWith('Todos')).click()");
      await js("(() => { const i = document.getElementById('filtro-nome'); i.value = 'muitas'; i.dispatchEvent(new Event('input')); })()");
      conferir(await js("document.querySelectorAll('#pasta1-lista .cliente-linha').length === 1"), 'o filtro por nome mostra só o cliente digitado');
      await js("(() => { const i = document.getElementById('filtro-nome'); i.value = ''; i.dispatchEvent(new Event('input')); })()");
      fs.rmSync(varias, { recursive: true, force: true });
      await js("document.getElementById('tab-novo').click()");
      conferir(await js("!document.querySelector('.area').hidden && document.getElementById('paginas').hidden"), 'clicar em MKP no menu do topo volta para a tela do MKP');
      await js("document.getElementById('tab-pasta1').click()");
      fs.rmSync(longo, { recursive: true, force: true });
      fs.rmSync(path.join(p1, 'SHOPEE'), { recursive: true, force: true });
      await js("document.getElementById('tab-pasta1').click()");
      await ate("document.querySelectorAll('#pasta1-lista .cliente-linha').length === 2", 'lista sem o cliente de teste');
      await foto('8-pasta1.png');
      await js("document.querySelector('#pasta1-lista .primario').click()");
      await ate("document.body.dataset.estado === 'pronto'", 'abrir a arte PNG');
      conferir((await js("document.querySelectorAll('#lista .item').length")) === 1, 'a imagem PNG abre como uma capa');
      conferir(await js("document.getElementById('qualidade').className.includes('limite')"), 'o painel de qualidade marca a imagem 1238×1562 como "no limite"');
      await foto('9-qualidade.png');
      await js("document.getElementById('exportar').click()");
      await ate("!document.getElementById('salvo').hidden", 'conclusão da arte PNG', 240000);
      conferir(!(await js("document.getElementById('salvo-aprovar').hidden")), 'o card tem o botão Enviar para Aprovar');
      await js("document.getElementById('salvo-aprovar').click()");
      await espera(800);
      const detalhe = await js("document.getElementById('salvo-detalhe').textContent");
      conferir(detalhe.includes('.cdr') && detalhe.includes('.pdf'), `sem .cdr e .pdf a pasta NÃO é movida e o app diz o que falta ("${detalhe}")`);
      conferir(fs.existsSync(cliente) && !fs.existsSync(path.join(p2, 'CLIENTE A')), 'a pasta continua na Pasta 1');
      fs.writeFileSync(path.join(cliente, 'capa.cdr'), 'x');
      fs.writeFileSync(path.join(cliente, 'capa.pdf'), 'x');
      await js("document.getElementById('salvo-aprovar').click()");
      await ate("document.body.dataset.estado === 'vazio'", 'voltar ao início depois de mover');
      conferir(!fs.existsSync(cliente) && fs.existsSync(path.join(p2, 'CLIENTE A', 'MKP')), 'completa, a pasta do cliente foi para a Pasta 2 com o MKP dentro');
      // alteração depois do envio
      await js("document.getElementById('tab-pasta1').click()");
      await js("document.getElementById('atualizar-pasta1').click()");
      await ate("[...document.querySelectorAll('#pasta1-lista .cliente-linha')].some(l => l.textContent.includes('CLIENTE A'))", 'CLIENTE A na lista da Pasta 2');
      conferir(!(await js("[...document.querySelectorAll('#pasta1-lista .cliente-linha')].find(l => l.textContent.includes('CLIENTE A')).textContent.includes('Alterado depois do envio')")), 'logo depois do envio o cliente NÃO aparece como alterado');
      const futuro = new Date(Date.now() + 10 * 60 * 1000);
      fs.utimesSync(path.join(p2, 'CLIENTE A', 'capa.cdr'), futuro, futuro);
      await js("document.getElementById('atualizar-pasta1').click()");
      conferir(await ate("[...document.querySelectorAll('#pasta1-lista .cliente-linha')].find(l => l.textContent.includes('CLIENTE A'))?.textContent.includes('Alterado depois do envio')", 'aviso de alteração'), 'arquivo mexido depois do envio mostra "Alterado depois do envio"');
      await js("[...document.querySelectorAll('#pasta1-lista .cliente-linha button')].find(b => b.textContent === 'Já avisei a admin')?.click()");
      conferir(await ate("!document.getElementById('pasta1-lista').textContent.includes('Alterado depois do envio')", 'aviso some'), '"Já avisei a admin" tira o aviso');
    } catch (e) {
      conferir(false, `exceção no roteiro: ${e}`);
    }
    console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK');
    app.exit(falhas.length ? 1 : 0);
  });
});
