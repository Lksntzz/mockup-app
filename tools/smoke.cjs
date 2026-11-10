// Teste de fumaça da janela: abre o app de verdade (Electron + tela virtual), abre um PDF, troca cores,
// tira capturas de tela e imprime o que viu. Uso (Linux):
//   xvfb-run -a node_modules/.bin/electron --no-sandbox tools/smoke.cjs <pdf> <pasta-de-saida>
const { app, dialog } = require('electron');
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
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [arquivoDoDialogo] });

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
  wc.on('did-finish-load', async () => {
    const js = (c) => wc.executeJavaScript(c);
    const ate = async (cond, rotulo, ms = 120000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await js(cond)) return true;
        await espera(200);
      }
      console.log('tempo esgotado esperando:', rotulo);
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

      await js("document.querySelectorAll('#lista .item')[1].click()");
      await espera(1500);
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
      await ate("document.body.dataset.estado === 'vazio' && !document.getElementById('salvo').hidden", 'conclusão');
      await foto('5-concluido.png');
      const cartao = await js("document.getElementById('salvo').textContent");
      conferir(cartao.includes('Salvo') && cartao.includes('5 mockups'), `aparece o card "Salvo" com a quantidade ("${cartao.replace(/\s+/g, ' ').trim()}")`);
      conferir((await js("document.getElementById('mensagem').textContent")) === '', 'a mensagem do topo é limpa depois de salvar');
      conferir(!/MKP|[\\\\/]/.test(cartao + (await js("document.getElementById('mensagem').textContent"))), 'nenhum caminho de pasta aparece na tela');
      const pastaMkp = path.join(path.dirname(pdfDoTrabalho), 'MKP');
      const nomes = fs.existsSync(pastaMkp) ? fs.readdirSync(pastaMkp).sort() : [];
      conferir(nomes.length === 5 && nomes[0] === 'CAPAS_capa-01.png' && nomes[4] === 'CAPAS_capa-05.png', `criou a pasta MKP ao lado do PDF com os 5 PNGs (${nomes.join(', ')})`);
      const cab = fs.readFileSync(path.join(pastaMkp, nomes[0] || 'x'));
      conferir(cab.readUInt32BE(16) === 1200 && cab.readUInt32BE(20) === 1200 && cab.subarray(1, 4).toString() === 'PNG', 'o primeiro PNG tem 1200×1200');
      conferir(!nomes.some((x) => x.includes('parcial')), 'nenhum arquivo temporário sobrou');
      conferir(fs.existsSync(pdfDoTrabalho), 'o PDF original continua no lugar');
      conferir(await js("document.getElementById('em-andamento').hidden"), 'ao concluir, o trabalho sai de "Em andamento"');
      conferir(!(await js("document.getElementById('exportar').disabled")), 'o botão Concluir voltou a ficar ativo');
    } catch (e) {
      conferir(false, `exceção no roteiro: ${e}`);
    }
    console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK');
    app.exit(falhas.length ? 1 : 0);
  });
});
