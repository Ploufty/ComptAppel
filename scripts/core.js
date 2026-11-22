/* Logique pure : état (format v3, réglages par mois), normalisation des données non fiables, calculs. */
(function (root) {
  const Cal = typeof module !== 'undefined' ? require('./calendar.js') : root.Calendrier;

  const MAIN_LEVELS = ['PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
  const EXTRA_LEVELS = ['TPS', 'ULIS', 'UPE2A', 'UEMA']; // rubrique « TPS et dispositifs »
  const LEVELS = ['TPS', ...MAIN_LEVELS, 'ULIS', 'UPE2A', 'UEMA']; // ordre d'affichage
  const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const MAX = { eleves: 60, abs: 5000, days: 80, moves: 30, off: 31, label: 60 };

  const MOIS_COURT = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
  const ZONES = ['A', 'B', 'C', 'Corse'];
  const YEARS = Object.keys(Cal.CALENDARS);
  const mlabel = mk => MOIS[+mk.slice(5, 7) - 1] + ' ' + mk.slice(0, 4);
  const mshort = mk => MOIS_COURT[+mk.slice(5, 7) - 1];
  const fmt = x => x.toFixed(2).replace('.', ',');

  function defaultYear(today) {
    const t = today || new Date().toISOString().slice(0, 10);
    return YEARS.find(y => t <= Cal.CALENDARS[y].fin) || YEARS[YEARS.length - 1];
  }
  function fresh(today) {
    const year = defaultYear(today), ms = Cal.schoolMonths(year), cur = (today || new Date().toISOString()).slice(0, 7);
    return { version: 3, year, zone: 'A', month: ms.includes(cur) ? cur : ms[0], months: {} };
  }

  // --- Normalisation : tout ce qui vient de localStorage ou d'un fichier passe par ici. Jamais d'exception.
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  // Entier borné ; '' (champ vide) conservé ; tout le reste → ''
  function int(v, max) {
    if (v === '' || v === null || v === undefined) return '';
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+([.,]\d+)?\s*$/.test(v) ? parseFloat(v.replace(',', '.')) : NaN;
    return Number.isFinite(n) && n >= 0 ? Math.min(max, Math.round(n)) : '';
  }
  const text = v => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX.label) : '';
  const dateIn = (v, mk) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v.slice(0, 7) === mk &&
    +v.slice(8) >= 1 && +v.slice(8) <= Cal.daysInMonth(mk) ? v : '';

  function normMonth(m, mk) {
    const lv = {}, levels = Array.isArray(m.levels) ? LEVELS.filter(l => m.levels.includes(l)) : [];
    const src = isObj(m.lv) ? m.lv : {};
    for (const l of LEVELS) {
      if (!isObj(src[l])) continue;
      const d = src[l];
      lv[l] = {
        n: int(d.n, MAX.eleves), abs: int(d.abs, MAX.abs),
        moves: (Array.isArray(d.moves) ? d.moves : []).slice(0, MAX.moves).filter(isObj)
          .map(x => ({ t: x.t === 'd' ? 'd' : 'a', date: dateIn(x.date, mk) }))
      };
    }
    const seen = new Set();
    const off = (Array.isArray(m.off) ? m.off : []).filter(isObj)
      .map(x => ({ date: dateIn(x.date, mk), label: text(x.label) }))
      .filter(x => x.date && !seen.has(x.date) && seen.add(x.date)).slice(0, MAX.off);
    const days = int(m.days, MAX.days);
    return {
      rhythm: m.rhythm === '4.5' ? '4.5' : '4',
      levels, days: days === '' ? null : days, off, lv
    };
  }

  function normalize(raw, today) {
    const s = fresh(today), r = raw;
    if (!isObj(r)) return s;
    if (YEARS.includes(r.year)) s.year = r.year;
    // La zone est commune à toute l'année. Anciens fichiers : zone du premier mois qui en avait une.
    const old = isObj(r.months) ? Object.keys(r.months).sort().map(k => isObj(r.months[k]) && r.months[k].zone).find(z => ZONES.includes(z)) : null;
    s.zone = ZONES.includes(r.zone) ? r.zone : old || 'A';
    const ms = Cal.schoolMonths(s.year);
    s.month = ms.includes(r.month) ? r.month : ms.includes(s.month) ? s.month : ms[0];
    if (isObj(r.months)) for (const mk of Object.keys(r.months)) {
      if (Cal.yearOf(mk) && isObj(r.months[mk])) s.months[mk] = normMonth(r.months[mk], mk);
    }
    return s;
  }

  const num = v => typeof v === 'number' ? v : 0;
  // Effectif repris du mois précédent : élèves du mois + arrivées − départs (modifiable ensuite)
  function carry(p) {
    const lv = {};
    for (const l of p.levels) {
      const d = p.lv[l];
      if (!d) continue;
      const n = num(d.n) + d.moves.filter(x => x.t === 'a').length - d.moves.filter(x => x.t === 'd').length;
      if (n > 0) lv[l] = { n, abs: '', moves: [] };
    }
    return lv;
  }
  // --- Mois : un mois absent hérite rythme, niveaux et effectifs du dernier mois saisi avant lui (rythme et niveaux : sinon du plus proche).
  function ensureMonth(s, mk) {
    if (s.months[mk]) return s.months[mk];
    const keys = Object.keys(s.months).sort();
    const before = keys.filter(k => k < mk).pop();
    const p = s.months[before || keys[0]] || { rhythm: '4', levels: [], lv: {} };
    return (s.months[mk] = { rhythm: p.rhythm, levels: p.levels.slice(), days: null, off: [], lv: before ? carry(s.months[before]) : {} });
  }
  // Mois affiché sans l'enregistrer : tant que rien n'est saisi, il suit les réglages du mois précédent.
  const viewMonth = (s, mk) => s.months[mk] || ensureMonth({ months: Object.assign({}, s.months) }, mk);
  const lvData = (m, l) => m.lv[l] || (m.lv[l] = { n: '', abs: '', moves: [] });

  function autoOf(s, m, mk, opts) {
    return Cal.autoDays(mk, s.zone, m.rhythm, Object.assign({ off: m.off.map(o => o.date) }, opts));
  }
  const daysOf = (s, m, mk) => m.days === null ? autoOf(s, m, mk) : m.days;

  // Demi-journées d'inscription d'un élève arrivé (à partir du jour d'arrivée inclus) ou parti (jusqu'au départ)
  function moveDJ(s, m, mk, mv) {
    const D = daysOf(s, m, mk);
    if (!mv.date) return D;
    const opts = mv.t === 'a' ? { from: mv.date } : { to: mv.date };
    return Math.min(D, autoOf(s, m, mk, opts));
  }

  function compute(s, mk) {
    const m = viewMonth(s, mk), D = daysOf(s, m, mk), rows = [];
    for (const l of LEVELS) {
      if (!m.levels.includes(l)) continue;
      const d = m.lv[l] || { n: '', abs: '', moves: [] };
      const poss = num(d.n) * D + d.moves.reduce((a, mv) => a + moveDJ(s, m, mk, mv), 0);
      const abs = num(d.abs);
      rows.push({ l, eff: num(d.n) + d.moves.length, poss, abs, real: poss - abs, pct: poss ? abs / poss * 100 : 0 });
    }
    const sum = f => rows.reduce((a, r) => a + r[f], 0);
    const tot = { l: 'Classe', eff: sum('eff'), poss: sum('poss'), abs: sum('abs') };
    tot.real = tot.poss - tot.abs; tot.pct = tot.poss ? tot.abs / tot.poss * 100 : 0;
    return { D, auto: autoOf(s, m, mk), manual: m.days !== null, rows, tot, month: m };
  }

  // Cumul de l'année : somme pondérée (présences possibles et absences additionnées), par mois et par niveau
  function cumul(s) {
    const rows = [], byLevel = {}, all = { poss: 0, abs: 0 };
    for (const mk of Cal.schoolMonths(s.year)) {
      if (!s.months[mk]) continue;
      const c = compute(s, mk);
      if (!c.tot.poss) continue;
      rows.push({ mk, D: c.D, poss: c.tot.poss, abs: c.tot.abs, pct: c.tot.pct, byLevel: c.rows });
      all.poss += c.tot.poss; all.abs += c.tot.abs;
      for (const r of c.rows) {
        const b = byLevel[r.l] || (byLevel[r.l] = { l: r.l, poss: 0, abs: 0 });
        b.poss += r.poss; b.abs += r.abs;
      }
    }
    const pct = o => (o.pct = o.poss ? o.abs / o.poss * 100 : 0, o);
    return { rows, levels: LEVELS.filter(l => byLevel[l]).map(l => pct(byLevel[l])), tot: pct(all) };
  }

  // Mois « fait » : au moins un niveau, et pour chacun un effectif et des absences saisis (0 compte)
  function monthDone(s, mk) {
    const m = s.months[mk];
    return !!m && m.levels.length > 0 && m.levels.every(l => m.lv[l] && num(m.lv[l].n) > 0 && m.lv[l].abs !== '');
  }

  const api = { MAIN_LEVELS, EXTRA_LEVELS, LEVELS, MOIS, MAX, YEARS, ZONES, mlabel, mshort, fmt, fresh, normalize, ensureMonth, viewMonth, lvData, daysOf, moveDJ, compute, cumul, monthDone };
  if (typeof module !== 'undefined') module.exports = api; else root.Core = api;
})(this);
