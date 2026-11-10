// Teste de fumaça da janela: abre o app de verdade (Electron + tela virtual), abre um PDF, troca cores,
// tira capturas de tela e imprime o que viu. Uso (Linux):
//   xvfb-run -a node_modules/.bin/electron --no-sandbox tools/smoke.cjs <pdf> <pasta-de-saida>
const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const [pdf, saida] = process.argv.slice(-2);
fs.mkdirSync(saida, { recursive: true });
let arquivoDoDialogo = pdf;
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [arquivoDoDialogo] });

require(path.resolve(__dirname, '../dist/main/main.js'));

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
      conferir(await ate("document.body.dataset.estado === 'vazio'", 'pacote carregado'), 'o pacote do mockup carregou e o app está pronto');
      await foto('1-vazio.png');

      await js("document.getElementById('abrir').click()");
      conferir(await ate("document.body.dataset.estado === 'pronto' && Number(document.body.dataset.previa) >= 1", 'PDF carregado'), 'abriu o PDF e mostrou a prévia');
      await foto('2-pdf-aberto.png');
      const n = await js("document.querySelectorAll('#lista .item').length");
      conferir(n === 5, `a lista tem 5 capas (tem ${n})`);
      conferir((await js("document.getElementById('mensagem').textContent")).includes('5 capas'), 'mensagem "5 capas carregadas"');

      const antes = Number(await js('document.body.dataset.previa'));
      await js("document.querySelector('[data-acc=elastico][data-id=rosa]').click()");
      await js("document.querySelector('[data-acc=wireo][data-id=rose-gold]').click()");
      await js("document.querySelector('[data-acc=tassel][data-id=rosa]').click()");
      conferir(await ate(`Number(document.body.dataset.previa) > ${antes}`, 'prévia atualizada'), 'a prévia atualizou depois de trocar as cores');
      await espera(500);
      await foto('3-cores-trocadas.png');

      await js("document.querySelectorAll('#lista .item')[1].click()");
      await espera(1500);
      await foto('4-capa-2.png');
      const cor2 = await js("document.querySelector('[data-acc=elastico][aria-pressed=true]').dataset.id");
      conferir(cor2 === 'preto', `a capa 2 mantém as cores iniciais (elástico ${cor2})`);

      await js("document.querySelectorAll('#lista .item')[0].click()");
      await js("document.getElementById('copiar').click()");
      await js("document.querySelectorAll('#lista .item')[3].click()");
      await espera(500);
      const cor4 = await js("document.querySelector('[data-acc=elastico][aria-pressed=true]').dataset.id");
      conferir(cor4 === 'rosa', `"Copiar para todas" levou o elástico rosa para a capa 4 (elástico ${cor4})`);

      arquivoDoDialogo = path.join(saida, 'nao-e-pdf.txt');
      fs.writeFileSync(arquivoDoDialogo, 'isto não é um PDF');
      await js("document.getElementById('abrir').click()");
      await ate("document.getElementById('mensagem').classList.contains('erro')", 'erro de PDF');
      const msg = await js("document.getElementById('mensagem').textContent");
      conferir(msg.includes('não é um PDF'), `arquivo que não é PDF mostra mensagem clara ("${msg}")`);
      conferir((await js("document.querySelectorAll('#lista .item').length")) === 5, 'o app continua com as 5 capas depois do erro');
    } catch (e) {
      conferir(false, `exceção no roteiro: ${e}`);
    }
    console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK');
    app.exit(falhas.length ? 1 : 0);
  });
});
