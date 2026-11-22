const assert = require('assert');
const C = require('../scripts/core.js');
let n = 0;
const test = (name, fn) => { fn(); n++; };
const TODAY = '2026-11-18';
const S0 = { zone: 'A' };
const month = (o) => Object.assign({ rhythm: '4', levels: [], days: null, off: [], lv: {} }, o);

test('moveDJ arrivée : compté à partir du jour d’arrivée inclus', () => {
  const m = month();
  assert.strictEqual(C.moveDJ(S0, m, '2026-10', { t: 'a', date: '2026-10-05' }), 16); // 5-9 et 12-16 octobre
  assert.strictEqual(C.moveDJ(S0, m, '2026-10', { t: 'a', date: '2026-10-16' }), 2);
  assert.strictEqual(C.moveDJ(S0, m, '2026-10', { t: 'a', date: '2026-10-10' }), 8); // samedi : compte à partir du lundi 12
});
test('moveDJ départ : compté jusqu’au jour du départ inclus', () => {
  const m = month();
  assert.strictEqual(C.moveDJ(S0, m, '2026-10', { t: 'd', date: '2026-10-01' }), 2);
  assert.strictEqual(C.moveDJ(S0, m, '2026-10', { t: 'd', date: '2026-10-06' }), 8); // 1, 2, 5, 6
});
test('moveDJ : sans date = mois complet ; borné par un total manuel ; jours sans classe retirés', () => {
  assert.strictEqual(C.moveDJ(S0, month(), '2026-10', { t: 'a', date: '' }), 20);
  assert.strictEqual(C.moveDJ(S0, month({ days: 10 }), '2026-10', { t: 'a', date: '2026-10-01' }), 10);
  assert.strictEqual(C.moveDJ(S0, month({ off: [{ date: '2026-10-12', label: 'grève' }] }), '2026-10', { t: 'a', date: '2026-10-05' }), 14);
});
test('compute : cas du blog (36 × 29 = 1044, 107 absences, 89,75 %)', () => {
  const s = C.normalize({ version: 3, year: '2026-2027', month: '2026-09', months: { '2026-09': month({ levels: ['CP'], days: 36, lv: { CP: { n: 29, abs: 107, moves: [] } } }) } }, TODAY);
  const c = C.compute(s, '2026-09');
  assert.strictEqual(c.tot.poss, 1044);
  assert.strictEqual(c.tot.real, 937);
  assert.strictEqual(C.fmt(100 - c.tot.pct), '89,75');
});
test('compute : niveaux + total, dispositifs comptés comme niveaux', () => {
  const s = C.normalize({ version: 3, year: '2026-2027', months: { '2026-10': month({ levels: ['ULIS', 'MS', 'TPS'], lv: {
    MS: { n: 10, abs: 4, moves: [{ t: 'a', date: '2026-10-05' }] }, TPS: { n: 2, abs: 0 }, ULIS: { n: 3, abs: 6 } } }) } }, TODAY);
  const c = C.compute(s, '2026-10');
  assert.deepStrictEqual(c.rows.map(r => r.l), ['TPS', 'MS', 'ULIS']);
  assert.strictEqual(c.rows[1].poss, 10 * 20 + 16);
  assert.strictEqual(c.rows[1].eff, 11);
  assert.strictEqual(c.tot.poss, 40 + 216 + 60);
  assert.strictEqual(c.tot.abs, 10);
});
test('cumul pondéré (somme des possibles et des absences, pas moyenne des %)', () => {
  const s = C.normalize({ version: 3, year: '2026-2027', months: {
    '2026-09': month({ levels: ['CP'], days: 36, lv: { CP: { n: 29, abs: 107 } } }),
    '2026-10': month({ levels: ['CP'], days: 10, lv: { CP: { n: 10, abs: 0 } } }) } }, TODAY);
  const cu = C.cumul(s);
  assert.strictEqual(cu.tot.poss, 1144);
  assert.strictEqual(cu.tot.abs, 107);
  assert.strictEqual(C.fmt(100 - cu.tot.pct), '90,65');
  assert.strictEqual(cu.levels[0].poss, 1144);
});
test('E : décocher GS en novembre ne change pas le cumul d’octobre', () => {
  const s = C.normalize(null, TODAY);
  const oct = C.ensureMonth(s, '2026-10');
  oct.levels = ['MS', 'GS'];
  Object.assign(C.lvData(oct, 'MS'), { n: 10, abs: 5 });
  Object.assign(C.lvData(oct, 'GS'), { n: 12, abs: 3 });
  const before = JSON.stringify(C.cumul(s).rows);
  const nov = C.ensureMonth(s, '2026-11');
  assert.deepStrictEqual(nov.levels, ['MS', 'GS']); // hérité
  nov.levels = nov.levels.filter(l => l !== 'GS');
  nov.rhythm = '4.5';
  assert.deepStrictEqual(oct.levels, ['MS', 'GS']);
  assert.strictEqual(oct.rhythm, '4');
  assert.strictEqual(JSON.stringify(C.cumul(s).rows.filter(r => r.mk === '2026-10')), before);
  assert.strictEqual(C.compute(s, '2026-10').tot.poss, 22 * 20);
});
test('mois affiché mais non saisi : pas enregistré, hérite des réglages saisis ensuite', () => {
  const s = C.normalize(null, TODAY);
  assert.deepStrictEqual(C.viewMonth(s, '2026-11').levels, []);
  assert.deepStrictEqual(Object.keys(s.months), []);
  const sep = C.ensureMonth(s, '2026-09');
  sep.levels = ['CP'];
  assert.deepStrictEqual(C.viewMonth(s, '2026-11').levels, ['CP']);
  assert.deepStrictEqual(Object.keys(s.months), ['2026-09']);
});
test('F : fichier piégé neutralisé', () => {
  const raw = JSON.parse('{"zone":"A","rhythm":"4","levels":{"MS":true},"months":{"2026-10":{"lv":{"MS":{"n":"\\"><img src=x onerror=window.__pwn=1>","abs":"3","moves":[]}}}}}');
  const s = C.normalize(raw, TODAY);
  const txt = JSON.stringify(s);
  assert.ok(!/img|onerror|pwn|</.test(txt), txt);
  assert.strictEqual(s.months['2026-10'].lv.MS.n, '');
  assert.strictEqual(s.months['2026-10'].lv.MS.abs, 3);
});
test('normalize : types faux, zone invalide, clés inconnues, dates hors mois', () => {
  const s = C.normalize({ version: 3, year: '1999', month: '<x>', evil: 1, months: {
    '2026-11': { zone: 'Z', rhythm: 5, levels: ['MS', 'XX', '<b>'], days: '999', __proto__x: 1, off: [{ date: '2026-12-01' }, { date: '2026-11-31' }, { date: '2026-11-12', label: 'x'.repeat(500) }, 'a'],
      lv: { MS: { n: -4, abs: '2,5', moves: [{ t: 'zz', date: '2026-10-02' }, 7, { t: 'd', date: '2026-11-20' }] }, HACK: { n: 1 } } },
    '2031-01': { zone: 'A' }, 'toString': {} } }, TODAY);
  assert.deepStrictEqual(Object.keys(s).sort(), ['month', 'months', 'version', 'year', 'zone']);
  assert.strictEqual(s.zone, 'A'); // 'Z' invalide : repli sur A
  assert.strictEqual(s.year, '2026-2027');
  assert.strictEqual(s.month, '2026-11');
  assert.deepStrictEqual(Object.keys(s.months), ['2026-11']);
  const m = s.months['2026-11'];
  assert.deepStrictEqual(Object.keys(m).sort(), ['days', 'levels', 'lv', 'off', 'rhythm']);
  assert.strictEqual(m.rhythm, '4');
  assert.deepStrictEqual(m.levels, ['MS']);
  assert.strictEqual(m.days, 80);
  assert.deepStrictEqual(m.off.map(o => o.date), ['2026-11-12']);
  assert.strictEqual(m.off[0].label.length, C.MAX.label);
  assert.deepStrictEqual(Object.keys(m.lv), ['MS']);
  assert.strictEqual(m.lv.MS.n, '');
  assert.strictEqual(m.lv.MS.abs, 3);
  assert.deepStrictEqual(m.lv.MS.moves, [{ t: 'a', date: '' }, { t: 'd', date: '2026-11-20' }]);
  for (const bad of [null, 42, 'x', [], { months: 'x' }, { version: 3, months: [] }]) assert.strictEqual(C.normalize(bad, TODAY).version, 3);
});
test('G : normalize est stable (réappliqué sur sa propre sortie, même résultat)', () => {
  const s = C.normalize({ version: 3, year: '2026-2027', month: '2026-11', months: { '2026-10': { zone: 'B', rhythm: '4.5', levels: ['MS'], days: 15, off: [],
    lv: { MS: { n: 10, abs: 4, moves: [{ t: 'a', date: '2026-10-05' }, { t: 'd', date: '2026-10-09' }] } } } } }, TODAY);
  assert.strictEqual(s.zone, 'B'); // la zone est commune à l'année (reprise du premier mois qui en avait une)
  assert.strictEqual(s.months['2026-10'].days, 15);
  assert.deepStrictEqual(C.normalize(JSON.parse(JSON.stringify(s)), TODAY), s);
});
test('année par défaut selon la date du jour', () => {
  assert.strictEqual(C.normalize(null, '2026-11-18').year, '2026-2027');
  assert.strictEqual(C.normalize(null, '2026-11-18').month, '2026-11');
  assert.strictEqual(C.normalize(null, '2027-08-15').year, '2027-2028');
});
test('zone commune à l’année : changer la zone recalcule tous les mois', () => {
  const s = C.normalize(null, TODAY);
  const feb = C.ensureMonth(s, '2027-02');
  feb.levels = ['MS']; Object.assign(C.lvData(feb, 'MS'), { n: 10, abs: 0 });
  assert.strictEqual(C.compute(s, '2027-02').D, 16); // zone A : vacances dès le 13
  s.zone = 'B';
  assert.strictEqual(C.compute(s, '2027-02').D, 24); // zone B : vacances dès le 20
  assert.strictEqual(C.normalize({ zone: 'Corse', months: {} }, TODAY).zone, 'Corse');
  assert.strictEqual(C.normalize({ zone: 'Y', months: { '2026-10': { zone: 'C' } } }, TODAY).zone, 'C'); // anciens fichiers
});
test('effectif repris du mois précédent : élèves + arrivées − départs, absences et déplacements remis à zéro', () => {
  const s = C.normalize(null, TODAY);
  const oct = C.ensureMonth(s, '2026-10');
  oct.levels = ['MS', 'GS'];
  Object.assign(C.lvData(oct, 'MS'), { n: 10, abs: 4, moves: [{ t: 'a', date: '2026-10-05' }, { t: 'a', date: '' }, { t: 'd', date: '2026-10-20' }] });
  Object.assign(C.lvData(oct, 'GS'), { n: 8, abs: 1 });
  const nov = C.viewMonth(s, '2026-11');
  assert.deepStrictEqual(nov.lv.MS, { n: 11, abs: '', moves: [] }); // 10 + 2 arrivées − 1 départ
  assert.deepStrictEqual(nov.lv.GS, { n: 8, abs: '', moves: [] });
  assert.deepStrictEqual(Object.keys(s.months), ['2026-10']); // simple affichage : rien d'enregistré
  const sep = C.viewMonth(s, '2026-09'); // avant tous les mois saisis : pas de report à rebours
  assert.deepStrictEqual(sep.lv, {});
  C.ensureMonth(s, '2026-11').lv.MS.n = 12; // modifiable
  assert.strictEqual(C.compute(s, '2026-11').rows[0].eff, 12);
});
test('mois « fait » : niveaux cochés, effectifs et absences saisis (0 compte)', () => {
  const s = C.normalize(null, TODAY);
  assert.strictEqual(C.monthDone(s, '2026-10'), false);
  const oct = C.ensureMonth(s, '2026-10');
  assert.strictEqual(C.monthDone(s, '2026-10'), false); // aucun niveau
  oct.levels = ['MS', 'GS'];
  Object.assign(C.lvData(oct, 'MS'), { n: 10, abs: 0 });
  assert.strictEqual(C.monthDone(s, '2026-10'), false); // GS manque
  Object.assign(C.lvData(oct, 'GS'), { n: 8, abs: '' });
  assert.strictEqual(C.monthDone(s, '2026-10'), false); // absences vides
  C.lvData(oct, 'GS').abs = 3;
  assert.strictEqual(C.monthDone(s, '2026-10'), true);
});
test('cumul : détail par niveau pour chaque mois, totaux par niveau et classe entière', () => {
  const s = C.normalize(null, TODAY);
  const oct = C.ensureMonth(s, '2026-10');
  oct.levels = ['MS', 'GS'];
  Object.assign(C.lvData(oct, 'MS'), { n: 10, abs: 4 }); Object.assign(C.lvData(oct, 'GS'), { n: 5, abs: 2 });
  const cu = C.cumul(s);
  assert.deepStrictEqual(cu.rows[0].byLevel.map(r => [r.l, r.poss, r.abs]), [['MS', 200, 4], ['GS', 100, 2]]);
  assert.deepStrictEqual(cu.levels.map(r => [r.l, r.poss, r.abs]), [['MS', 200, 4], ['GS', 100, 2]]);
  assert.deepStrictEqual([cu.tot.poss, cu.tot.abs], [300, 6]); // classe entière
});
console.log(`core : ${n} tests OK`);
