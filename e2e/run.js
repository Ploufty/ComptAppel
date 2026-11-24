/* Contrôles dans un vrai navigateur (Chromium) : saisie, sauvegarde et reprise, remise à zéro, mobile et tablette.
   Utilisation :  npm i --no-save playwright && npx playwright install chromium && node e2e/run.js
   Le dépôt n'a aucune dépendance : playwright n'est installé que pour ce contrôle. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
let pw;
try { pw = require('playwright'); } catch (e) { console.error('playwright introuvable : npm i --no-save playwright && npx playwright install chromium'); process.exit(2); }

const ROOT = path.join(__dirname, '..'), TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

let fails = 0;
const ok = (name, cond, detail = '') => { if (!cond) fails++; console.log((cond ? 'OK    ' : 'ÉCHEC ') + name + (detail ? ' — ' + detail : '')); };

(async () => {
  await new Promise(res => server.listen(0, res));
  const URL = 'http://localhost:' + server.address().port + '/index.html', tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comptappel-'));
  const browser = await pw.chromium.launch(), errs = [];
  const open = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL);
    return { ctx, p };
  };
  const close = (p, dlg) => p.click(`${dlg} [data-close] >> nth=1`);
  const prefs = p => p.evaluate(() => JSON.parse(localStorage.getItem('cahier-appel-prefs') || 'null'));
  const data = p => p.evaluate(() => JSON.parse(localStorage.getItem('cahier-appel-v3') || 'null'));

  // --- Saisie : niveaux, addition, « aucune absence », période sans classe
  let { ctx, p } = await open();
  await p.selectOption('#month', '2026-10'); await p.click('[data-pick]');
  await p.click('#levels label:has-text("MS")'); await p.click('#levels label:has-text("GS")'); await close(p, '#dlgLv');
  await p.fill('.lrow[data-l=MS] [data-f=n]', '10'); await p.fill('.lrow[data-l=GS] [data-f=n]', '5');
  await p.fill('.lrow[data-l=MS] [data-f=abs]', '3+2+4');
  ok('addition « 3+2+4 » = 9 absences', (await p.innerText('.lrow[data-l=MS] + .lpcrow .lpc')).includes('95,50'));
  await p.fill('.lrow[data-l=MS] [data-f=abs]', '3+x');
  ok('saisie invalide signalée', (await p.innerText('.lrow[data-l=MS] + .lpcrow .lpc')).includes('non reconnue'));
  await p.fill('.lrow[data-l=MS] [data-f=abs]', '9');
  ok('bouton « Aucune absence » visible puis effectif', await p.isVisible('#zeroAbs'));
  await p.click('#zeroAbs');
  ok('GS passe à 0 et le bouton disparaît', (await p.inputValue('.lrow[data-l=GS] [data-f=abs]')) === '0' && !(await p.isVisible('#zeroAbs')));
  await p.click('#calBtn'); await p.fill('#offFrom', '2026-10-12'); await p.fill('#offTo', '2026-10-13'); await p.fill('#offLabel', 'neige'); await p.click('#offAdd');
  ok('période sans classe : 20 → 16 demi-journées', (await p.inputValue('#days')) === '16');
  await close(p, '#dlgCal');
  ok('mois terminé : rappel de sauvegarde', await p.isVisible('#saveNudge'));
  ok('pourcentages présents puis absents affichés', /\d+,\d\d\s% de présents · \d+,\d\d\s% d'absents/.test(await p.innerText('.lrow[data-l=MS] + .lpcrow .lpc')));

  // --- Sauvegarde puis reprise sur un navigateur vide
  await p.click('#t-annee');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#save')]);
  const file = path.join(tmp, 'sauv.json'); await dl.saveAs(file);
  const f = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok('fichier complet (saisie, zone, rythme, niveaux, date)', f.app === 'ComptAppel' && !!f.savedAt && !!f.zone && !!f.rhythm && f.levels.join() === 'MS,GS' && !!f.months['2026-10']);
  ok('état : tout est sauvegardé', (await p.innerText('#saveState')).includes('tout est sauvegardé'));
  const snap = async pg => ({ year: await pg.innerText('#recapLv'), mat: await pg.innerText('#recap') });
  const before = await snap(p); await ctx.close();
  ({ ctx, p } = await open());
  await p.click('#t-annee'); await p.setInputFiles('#load', file);
  ok('confirmation détaillée avant de remplacer', (await p.innerText('#importTxt')).includes('niveaux MS GS'));
  await p.click('#importOk');
  const after = await snap(p);
  ok('totaux de l\'année identiques après la reprise', before.year === after.year && before.mat === after.mat);
  ok('réglages de la classe repris et mémorisés', JSON.stringify([(await prefs(p)).zone, (await prefs(p)).rhythm, (await prefs(p)).levels]) === JSON.stringify([f.zone, f.rhythm, f.levels]));
  fs.writeFileSync(path.join(tmp, 'casse.json'), '{"months":'); await p.setInputFiles('#load', path.join(tmp, 'casse.json')); await p.waitForTimeout(150);
  ok('fichier cassé refusé sans rien modifier', (await p.innerText('#fileMsg')).includes('non reconnu') && Object.keys((await data(p)).months).length === 1);

  // --- Remise à zéro : confirmation obligatoire, portées, annulation
  await p.click('#settings-open'); await p.click('#resetStart');
  ok('remise à zéro : bouton bloqué sans le mot', await p.isDisabled('#resetOk'));
  await p.evaluate(() => document.getElementById('resetOk').click());
  ok('clic forcé sans le mot : rien n\'est effacé', Object.keys((await data(p)).months).length === 1);
  await p.fill('#resetWord', ' effacer '); await p.click('#resetOk');
  ok('saisie effacée, réglages gardés', Object.keys((await data(p)).months).length === 0 && (await data(p)).levels.join() === 'MS,GS');
  await p.click('#resetUndo');
  ok('annulation : saisie revenue', Object.keys((await data(p)).months).length === 1);
  await ctx.close();

  // --- Mobile et tablette : pas de débordement, polices >= 16 px, bouton « + », deux volets selon la largeur
  const devices = ['iPhone SE', 'iPhone 14', 'iPhone 14 Pro Max', 'Pixel 7', 'iPad Mini', 'iPad Pro 11', 'iPhone 14 landscape', 'Pixel 7 landscape', 'iPad Mini landscape'];
  for (const name of devices) {
    const d = pw.devices[name];
    ({ ctx, p } = await open(d));
    await p.tap('[data-pick]'); await p.tap('#levels label:has-text("MS")'); await p.tap('#dlgLv [data-close] >> nth=1');
    await p.fill('.lrow[data-l=MS] [data-f=n]', '10'); await p.fill('.lrow[data-l=MS] [data-f=abs]', '3');
    let plus = 'n/a';
    if (await p.isVisible('.plusbtn')) { await p.tap('.plusbtn'); await p.keyboard.type('2'); await p.tap('.lrow[data-l=MS] [data-f=n]'); plus = (await p.inputValue('.lrow[data-l=MS] [data-f=abs]')) === '5'; }
    const tabs = await p.evaluate(() => !document.getElementById('t-resultat').hidden);
    if (tabs) await p.tap('#t-resultat');
    const m = await p.evaluate(() => {
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      const rect = s => document.querySelector(s).getBoundingClientRect(), hit = (a, b) => !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
      return { ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        small: [...document.querySelectorAll('input,select')].filter(vis).filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).length,
        overlap: hit(rect('.brand'), rect('.top-m')) || hit(rect('.brand'), rect('.top-r')) || hit(rect('.top-m'), rect('.top-r')) };
    });
    const w = d.viewport.width;
    ok(`${name} (${w}×${d.viewport.height}) : sans débordement, en-tête net, polices ≥ 16 px${plus === 'n/a' ? '' : ', bouton « + »'}`, m.ov === 0 && !m.overlap && m.small === 0 && plus !== false);
    ok(`${name} : ${w >= 740 ? 'deux volets' : 'onglets'} selon la largeur`, tabs === (w < 740));
    await ctx.close();
  }

  console.log(errs.length ? 'erreurs JS : ' + JSON.stringify(errs) : 'aucune erreur JS');
  if (errs.length) fails++;
  console.log(fails ? `${fails} ÉCHEC(S)` : 'TOUT PASSE');
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
