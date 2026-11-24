/* Interface : tableau de bord (saisie rapide). Toute valeur interpolée dans du HTML passe par esc(). */
(function () {
  const C = Core, Cal = Calendrier;
  const KEY = 'cahier-appel-v3';
  const $ = id => document.getElementById(id);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const dfr = d => d.slice(8) + '/' + d.slice(5, 7);
  const clamp = (v, max) => v === '' ? '' : Math.min(max, Math.max(0, Math.round(+v) || 0));

  const storeFail = () => { $('storeWarn').hidden = false; };
  function readStore() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { storeFail(); return null; }
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  let undoSnap = null; // dernière remise à zéro, annulable tant que rien d'autre n'est modifié
  function save() { undoSnap = null; $('resetUndo').hidden = true; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { storeFail(); } }

  let S = C.normalize(readStore());
  // Réglages de la classe (zone, rythme, niveaux) : mémorisés pour l'usager (préférences de l'appareil), communs à toutes les années et aux fichiers chargés.
  function applyClassPrefs() {
    if (C.ZONES.includes(P.zone)) S.zone = P.zone;
    if (P.rhythm === '4' || P.rhythm === '4.5') S.rhythm = P.rhythm;
    if (Array.isArray(P.levels)) S.levels = C.normLevels(P.levels);
  }
  applyClassPrefs();
  const rememberClass = () => { P.zone = S.zone; P.rhythm = S.rhythm; P.levels = S.levels.slice(); savePrefs(); };
  const view = () => C.viewMonth(S, S.month);
  const own = () => C.ensureMonth(S, S.month);
  let mvLevel = null, tab = 'saisie';

  // --- En-tête, bandeau calendrier
  function head() {
    const ms = Cal.schoolMonths(S.year), i = ms.indexOf(S.month);
    $('year').innerHTML = C.YEARS.map(y => `<option value="${esc(y)}"${y === S.year ? ' selected' : ''}>${esc(y)}</option>`).join('');
    $('year').hidden = C.YEARS.length < 2;
    $('month').innerHTML = ms.map(k => `<option value="${esc(k)}"${k === S.month ? ' selected' : ''}>${esc(C.mlabel(k))}</option>`).join('');
    $('prev').disabled = i <= 0; $('next').disabled = i >= ms.length - 1;
    $('months').innerHTML = ms.map(k => `<button type="button" data-mk="${esc(k)}" aria-label="${esc(C.mlabel(k))}">${esc(C.mshort(k))}</button>`).join('');
    $('foot').textContent = `ComptAppel · Année scolaire ${S.year} · Saisie conservée dans ce navigateur`;
  }
  function calTxt() {
    const m = view(), c = C.compute(S, S.month), off = m.off.filter(o => o.date).length;
    $('calTxt').textContent = `${Cal.zoneLabel(S.zone)} · ${S.rhythm === '4' ? '4 jours' : '4,5 jours'} · ${c.D} demi-journées de classe` +
      (c.manual ? ' (modifié)' : '') + (off ? ` · ${off} jour${off > 1 ? 's' : ''} retiré${off > 1 ? 's' : ''}` : '');
  }

  // --- Saisie : une ligne par niveau (construite quand les niveaux ou le mois changent ; jamais pendant la frappe)
  function rows() {
    exprErr.clear(); // une saisie d'addition non reconnue ne doit pas suivre d'un mois à l'autre
    const m = view(), on = C.LEVELS.filter(l => S.levels.includes(l));
    $('rowsHint').hidden = !on.length;
    if (!on.length) {
      $('rows').innerHTML = '<div class="emptybox"><p>Choisissez les niveaux de la classe pour commencer.</p><button type="button" class="btn primary" data-pick>Choisir les niveaux</button></div>';
      return;
    }
    $('rows').innerHTML = '<div class="lhead" aria-hidden="true"><span></span><span>Élèves</span><span>Absences</span><span class="hmv">Arrivée / départ</span></div>' + on.map(l => {
      const d = C.lvData(m, l), n = d.moves.length;
      return `<div class="lrow" role="group" aria-label="${esc(l)}" data-l="${esc(l)}"><b class="lname">${esc(l)}</b>
        <input class="num" type="number" min="0" max="${C.MAX.eleves}" step="1" inputmode="numeric" data-f="n" value="${esc(d.n)}" aria-label="${esc(l)} : élèves présents tout le mois">
        <input class="num" type="text" inputmode="numeric" autocomplete="off" data-f="abs" value="${esc(d.abs)}" aria-label="${esc(l)} : absences en demi-journées (un total ou une addition, par exemple 3+2+4)">
        <button type="button" class="icon-btn mvbtn" data-mv data-tip="Arrivée ou départ d'un élève en cours de mois" aria-label="${esc(l)} : arrivées et départs${n ? ' (' + n + ')' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="8" r="3.2"/><path d="M2.5 20c0-3.4 2.7-6 6-6s6 2.6 6 6"/><path d="M17 6.5h4.5m0 0-1.8-1.8M21.5 6.5l-1.8 1.8M21.5 13H17m0 0 1.8-1.8M17 13l1.8 1.8"/></svg>${n ? `<span class="badge" aria-hidden="true">${n}</span>` : ''}</button>
      </div><div class="lpc" data-pc="${esc(l)}"></div>`;
    }).join('');
  }

  // --- Résultat (met à jour sans toucher aux champs de saisie)
  const num = v => typeof v === 'number' ? v : 0, exprErr = new Set();
  let announceT = null;
  function results() {
    const k = S.month, { D, rows: rs, tot } = C.compute(S, k), ok = rs.length && tot.poss, pres = ok ? C.fmt(100 - tot.pct) : '–';
    const abs = ok ? C.fmt(tot.pct) : '–';
    $('bigPct').textContent = pres + (ok ? ' %' : '');
    $('bigAbs').textContent = ok ? `${abs}\u00a0% d'absents` : '';
    $('meter').style.width = ok ? (100 - tot.pct).toFixed(1) + '%' : '0';
    $('tabPct').textContent = ok ? pres + ' %' : '';
    $('resCap').textContent = rs.map(r => r.l).join(' ');
    $('stats').innerHTML = [['Possible', tot.poss], ['Présent', tot.real], ['Absent', tot.abs], ['Demi-j.', D]].map(([a, b]) => `<div><dt>${a}</dt><dd><button type="button" class="statbtn" data-calc aria-label="Voir le calcul : ${a} ${b}">${b}</button></dd></div>`).join('');
    $('detailInline').hidden = P.detail !== true;
    if (P.detail === true) $('detailInline').innerHTML = calcHtml(k);
    const tr = (r, c) => `<tr class="${c || ''}"><td>${esc(r.l)}</td><td>${r.poss}</td><td${r.abs > r.poss ? ' class="warn"' : ''}>${r.abs}</td><td>${r.poss ? C.fmt(100 - r.pct) : '–'} %</td><td>${r.poss ? C.fmt(r.pct) : '–'} %</td></tr>`;
    $('res').innerHTML = '<tr><th scope="col">Niveau</th><th scope="col">Possibles</th><th scope="col">Absences</th><th scope="col">% présents</th><th scope="col">% absents</th></tr>' +
      (rs.length ? rs.map(r => tr(r)).join('') + (rs.length > 1 ? tr(tot, 'tot') : '') : '<tr><td colspan="4" class="empty">Aucun niveau.</td></tr>');
    document.querySelectorAll('.lpc').forEach(el => {
      const r = rs.find(x => x.l === el.dataset.pc);
      if (!r) return;
      const bad = r.abs > r.poss;
      el.classList.toggle('bad', bad || exprErr.has(el.dataset.pc));
      el.textContent = exprErr.has(el.dataset.pc) ? 'Saisie non reconnue : chiffres et « + » seulement (par exemple 3+2+4).' : bad ? 'Les absences dépassent les présences possibles : vérifiez la saisie.' : r.poss ? `${C.fmt(100 - r.pct)}\u00a0% de présents · ${C.fmt(r.pct)}\u00a0% d'absents` : 'Saisissez les élèves pour voir le pourcentage.';
    });
    $('zeroAbs').hidden = !S.levels.some(l => { const d = view().lv[l]; return d && num(d.n) > 0 && d.abs === ''; });
    $('saisieSum').textContent = ok ? `Classe entière : ${pres}\u00a0% de présents · ${abs}\u00a0% d'absents` : '';
    document.querySelectorAll('.lrow').forEach(row => {
      const r = rs.find(x => x.l === row.dataset.l), bad = !!r && r.abs > r.poss;
      row.querySelectorAll('input').forEach(i => bad ? i.setAttribute('aria-invalid', 'true') : i.removeAttribute('aria-invalid'));
      row.title = bad ? 'Les absences dépassent les présences possibles : vérifiez la saisie.' : '';
    });
    calTxt();
    monthsUI();
    saveUI();
    const cu = C.cumul(S);
    // Cumul : % de présents par mois (classe entière et chaque niveau), puis totaux de l'année par niveau et pour la classe
    const lvs = cu.levels.map(r => r.l), pc = (poss, abs) => poss ? C.fmt(100 - abs / poss * 100) + ' %' : '–';
    $('recap').innerHTML = `<tr><th scope="col">Mois</th><th scope="col">Demi-j.</th><th scope="col">Classe entière</th>${lvs.map(l => `<th scope="col">${esc(l)}</th>`).join('')}</tr>` +
      (cu.rows.length ? cu.rows.map(r => `<tr${C.monthDone(S, r.mk) ? ' class="done"' : ''}><td><button type="button" class="statbtn" data-calc="${esc(r.mk)}" aria-label="Voir le calcul de ${esc(C.mlabel(r.mk))}">${esc(C.mlabel(r.mk))}</button></td><td>${r.D}</td><td>${pc(r.poss, r.abs)}</td>${lvs.map(l => { const x = r.byLevel.find(y => y.l === l); return `<td>${x ? pc(x.poss, x.abs) : '–'}</td>`; }).join('')}</tr>`).join('') +
        `<tr class="tot"><td>Année</td><td></td><td>${pc(cu.tot.poss, cu.tot.abs)}</td>${cu.levels.map(r => `<td>${pc(r.poss, r.abs)}</td>`).join('')}</tr>`
        : `<tr><td colspan="${3 + lvs.length}" class="empty">Les mois saisis apparaîtront ici.</td></tr>`);
    $('recapLv').hidden = !cu.rows.length;
    $('recapLv').innerHTML = '<tr><th scope="col">Total de l\'année</th><th scope="col">Possibles</th><th scope="col">Absences</th><th scope="col">Présences</th><th scope="col">% présents</th><th scope="col">% absents</th></tr>' +
      cu.levels.map(r => `<tr><td>${esc(r.l)}</td><td>${r.poss}</td><td>${r.abs}</td><td>${r.poss - r.abs}</td><td>${pc(r.poss, r.abs)}</td><td>${r.poss ? C.fmt(r.pct) + ' %' : '–'}</td></tr>`).join('') +
      `<tr class="tot"><td>Classe entière</td><td>${cu.tot.poss}</td><td>${cu.tot.abs}</td><td>${cu.tot.poss - cu.tot.abs}</td><td>${pc(cu.tot.poss, cu.tot.abs)}</td><td>${cu.tot.poss ? C.fmt(cu.tot.pct) + ' %' : '–'}</td></tr>`;
    clearTimeout(announceT);
    if (userTyped) announceT = setTimeout(() => { $('announce').textContent = ok ? `${C.mlabel(k)} : ${pres} % de présents.` : ''; }, 1000);
  }
  let userTyped = false;
  const refresh = () => { head(); rows(); results(); showTab(tab); };

  // --- Onglets : sur grand écran, Saisie et Résultat s'affichent ensemble
  const wide = matchMedia('(min-width: 900px)');
  function showTab(t) {
    tab = t;
    const eff = wide.matches && t === 'resultat' ? 'saisie' : t;
    $('p-saisie').hidden = eff !== 'saisie';
    $('p-resultat').hidden = !(eff === 'resultat' || (wide.matches && eff === 'saisie'));
    $('p-annee').hidden = eff !== 'annee';
    $('views').classList.toggle('two', wide.matches && eff === 'saisie');
    $('t-resultat').hidden = wide.matches;
    ['saisie', 'resultat', 'annee'].forEach(x => $('t-' + x).setAttribute('aria-selected', String(x === eff)));
  }
  ['saisie', 'resultat', 'annee'].forEach(x => { $('t-' + x).onclick = () => showTab(x); });
  wide.addEventListener('change', () => showTab(tab));

  // --- Mois et année
  function goMonth(k) { S.month = k; save(); refresh(); }
  function go(d) { const ms = Cal.schoolMonths(S.year), i = ms.indexOf(S.month) + d; if (i >= 0 && i < ms.length) goMonth(ms[i]); }
  $('prev').onclick = () => go(-1);
  $('next').onclick = () => go(1);
  $('month').onchange = e => goMonth(e.target.value);
  $('year').onchange = e => { S.year = e.target.value; goMonth(Cal.schoolMonths(S.year)[0]); };

  // --- Saisie rapide : sélection au focus, Entrée = champ suivant
  const nums = () => [...document.querySelectorAll('#rows input.num')];
  $('rows').addEventListener('focusin', e => { if (e.target.matches('input.num')) e.target.select(); });
  $('rows').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches('input.num')) return;
    e.preventDefault();
    const all = nums(), nx = all[all.indexOf(e.target) + 1];
    if (nx) nx.focus(); else e.target.blur();
  });
  $('rows').oninput = e => {
    const t = e.target, row = t.closest('.lrow');
    if (!row || !t.dataset.f) return;
    const l = row.dataset.l;
    if (t.dataset.f === 'abs') { // total ou addition (3+2+4) ; saisie non reconnue : on garde la valeur précédente et on le signale
      const v = C.sumExpr(t.value);
      if (v === null) { exprErr.add(l); results(); return; }
      exprErr.delete(l);
      C.lvData(own(), l).abs = v === '' ? '' : Math.min(C.MAX.abs, v);
    } else C.lvData(own(), l)[t.dataset.f] = clamp(t.value, C.MAX.eleves);
    userTyped = true; save(); results();
  };
  $('rows').onchange = e => { // à la sortie du champ, on affiche le total retenu
    const t = e.target, row = t.closest('.lrow');
    if (!row || t.dataset.f !== 'abs') return;
    exprErr.delete(row.dataset.l);
    t.value = String(C.lvData(view(), row.dataset.l).abs);
    results();
  };
  $('zeroAbs').onclick = () => {
    const m = own();
    for (const l of S.levels) { const d = C.lvData(m, l); if (num(d.n) > 0 && d.abs === '') d.abs = 0; }
    document.querySelectorAll('.lrow').forEach(r => { r.querySelector('[data-f=abs]').value = String(C.lvData(m, r.dataset.l).abs); });
    save(); results();
  };
  $('rows').onclick = e => {
    if (e.target.closest('[data-pick]')) return openLv();
    const b = e.target.closest('[data-mv]');
    if (b) { mvLevel = b.closest('.lrow').dataset.l; mvUI(); $('dlgMv').showModal(); }
  };

  // --- Fenêtre niveaux
  function lvUI() {
    const m = view(), chip = l => `<label><input type="checkbox" value="${esc(l)}"${S.levels.includes(l) ? ' checked' : ''}><span>${esc(l)}</span></label>`;
    $('levels').innerHTML = C.MAIN_LEVELS.map(chip).join('');
    $('extraBox').innerHTML = C.EXTRA_LEVELS.map(chip).join('');
  }
  function openLv() { lvUI(); $('dlgLv').showModal(); }
  $('lvBtn').onclick = openLv;
  $('dlgLv').onchange = () => {
    const on = new Set([...document.querySelectorAll('#dlgLv input:checked')].map(i => i.value));
    S.levels = C.LEVELS.filter(l => on.has(l));
    rememberClass(); save(); rows(); results();
  };

  // --- Fenêtre arrivées / départs d'un niveau
  function mvUI() {
    const m = view(), k = S.month, d = C.lvData(m, mvLevel);
    $('mv-title').textContent = `${mvLevel} : arrivées et départs`;
    $('mvList').innerHTML = d.moves.map((mv, i) => `<div class="mv" data-i="${i}">
      <select data-k="t" aria-label="Arrivée ou départ"><option value="a"${mv.t === 'a' ? ' selected' : ''}>Arrivé(e) le</option><option value="d"${mv.t === 'd' ? ' selected' : ''}>Parti(e) le</option></select>
      <input type="date" data-k="date" value="${esc(mv.date)}" min="${k}-01" max="${k}-${Cal.daysInMonth(k)}" aria-label="Date">
      <span class="hint" data-dj></span>
      <button type="button" class="btn ghost" data-del>Retirer</button></div>`).join('');
    mvHints();
  }
  function mvHints() {
    const m = view(), d = C.lvData(m, mvLevel);
    document.querySelectorAll('#mvList [data-dj]').forEach((sp, i) => {
      const mv = d.moves[i];
      sp.textContent = mv.date ? `= ${C.moveDJ(S, m, S.month, mv)} demi-journées` : 'Sans date : mois complet.';
    });
  }
  $('mvAdd').onclick = () => { const d = C.lvData(own(), mvLevel); if (d.moves.length < C.MAX.moves) d.moves.push({ t: 'a', date: '' }); save(); mvUI(); rows(); results(); };
  $('mvList').oninput = e => {
    const t = e.target, row = t.closest('[data-i]');
    if (!row) return;
    const mv = C.lvData(own(), mvLevel).moves[+row.dataset.i];
    if (t.dataset.k === 't') mv.t = t.value === 'd' ? 'd' : 'a';
    else mv.date = t.value.slice(0, 7) === S.month ? t.value : '';
    save(); mvHints(); results();
  };
  $('mvList').onclick = e => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    C.lvData(own(), mvLevel).moves.splice(+b.closest('[data-i]').dataset.i, 1);
    save(); mvUI(); rows(); results();
  };

  // --- Fenêtre calendrier du mois
  function radios(el, name, opts, val) {
    el.innerHTML = opts.map(([v, t]) => `<label><input type="radio" name="${esc(name)}" value="${esc(v)}"${v === val ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('');
  }
  function calUI() {
    const m = view();
    radios($('zone'), 'zone', Cal.zonesOf(S.year).map(z => [z, Cal.zoneLabel(z)]), S.zone);
    radios($('rhythm'), 'rhythm', [['4', '4 jours'], ['4.5', '4,5 jours (mercredi matin)']], S.rhythm);
    const gr = C.groupOff(m.off);
    $('offList').innerHTML = gr.length ? gr.map(g => `<div class="mv"><span>${esc(g.from === g.to ? dfr(g.from) : dfr(g.from) + ' au ' + dfr(g.to))}${g.label ? ' · ' + esc(g.label) : ''}</span><button type="button" class="btn ghost" data-odel="${esc(g.from)}">Retirer</button></div>`).join('') : '<p class="hint">Aucun jour sans classe ce mois.</p>';
    ['offFrom', 'offTo'].forEach(id => { $(id).min = S.month + '-01'; $(id).max = S.month + '-' + Cal.daysInMonth(S.month); });
    daysUI();
  }
  function daysUI() {
    const m = view(), c = C.compute(S, S.month);
    if (document.activeElement !== $('days')) $('days').value = c.D;
    $('autoNote').textContent = c.manual ? `Calcul automatique : ${c.auto}.` : 'Calculé selon le mois, la zone et le rythme. Modifiable.';
    $('reset').hidden = !c.manual;
    const off = m.off.filter(o => o.date), fer = Cal.feriesOf(S.month, S.zone);
    $('offNote').textContent = [
      off.length ? `${off.length} jour${off.length > 1 ? 's' : ''} retiré${off.length > 1 ? 's' : ''} : ` + off.map(o => dfr(o.date) + (o.label ? ' (' + o.label + ')' : '')).join(', ') + '.' : '',
      Cal.zonesOf(S.year).includes(S.zone) ? '' : 'Calendrier ' + S.zone + ' non communiqué pour cette année : zone A utilisée.',
      fer.length ? 'Fériés : ' + fer.map(f => dfr(f.date) + ' (' + f.label + ')').join(', ') + '.' : ''
    ].filter(Boolean).join(' ');
  }
  const calUpdate = () => { save(); daysUI(); results(); };
  $('calBtn').onclick = () => { calUI(); $('dlgCal').showModal(); };
  $('zone').onchange = e => { S.zone = C.ZONES.includes(e.target.value) ? e.target.value : S.zone; rememberClass(); calUpdate(); };
  $('rhythm').onchange = e => { S.rhythm = e.target.value === '4.5' ? '4.5' : '4'; rememberClass(); calUpdate(); };
  function setDays(v) {
    const m = own(), n = clamp(v, C.MAX.days);
    m.days = n === '' ? null : n;
    if (m.days === C.compute(S, S.month).auto) m.days = null;
    calUpdate();
  }
  $('days').oninput = e => setDays(e.target.value);
  $('days').onblur = () => daysUI();
  $('dm').onclick = () => { $('days').value = Math.max(0, (+$('days').value || 0) - 1); setDays($('days').value); };
  $('dp').onclick = () => { $('days').value = Math.min(C.MAX.days, (+$('days').value || 0) + 1); setDays($('days').value); };
  $('reset').onclick = () => { own().days = null; calUpdate(); };
  $('offAdd').onclick = () => {
    const m = own(), err = $('offErr'), dates = C.rangeDates(S.month, $('offFrom').value, $('offTo').value);
    const fail = t => { err.textContent = t; err.hidden = false; };
    if (!dates) return fail($('offFrom').value ? 'Dates invalides : la fin doit suivre le début, dans le même mois.' : 'Choisissez au moins la date de début.');
    const have = new Set(m.off.map(o => o.date)), add = dates.filter(d => !have.has(d));
    if (!add.length) return fail('Ces jours sont déjà saisis.');
    if (m.off.length + add.length > C.MAX.off) return fail('Trop de jours sans classe pour ce mois.');
    const label = $('offLabel').value.trim().slice(0, C.MAX.label);
    add.forEach(date => m.off.push({ date, label }));
    err.hidden = true; $('offFrom').value = $('offTo').value = $('offLabel').value = '';
    calUI(); calUpdate();
  };
  $('offList').onclick = e => {
    const b = e.target.closest('[data-odel]');
    if (!b) return;
    const g = C.groupOff(own().off).find(x => x.from === b.dataset.odel);
    if (g) own().off = own().off.filter(o => !g.dates.includes(o.date));
    calUI(); calUpdate();
  };

  // --- Fenêtres : fermeture (bouton, clic à côté) ; la saisie est rafraîchie à la fermeture
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  });
  $('dlgCal').addEventListener('close', () => { rows(); results(); });
  $('dlgMv').addEventListener('close', () => { rows(); results(); });

  // Bandeau des mois : mois « fait » surligné (✓), mois affiché marqué
  function monthsUI() {
    document.querySelectorAll('#months button').forEach(b => {
      const k = b.dataset.mk, done = C.monthDone(S, k);
      b.classList.toggle('done', done);
      b.setAttribute('aria-label', C.mlabel(k) + (done ? ', terminé' : ''));
      if (k === S.month) { b.setAttribute('aria-current', 'true'); if (!b.dataset.seen) { b.dataset.seen = '1'; b.scrollIntoView({ inline: 'center', block: 'nearest' }); } } else b.removeAttribute('aria-current');
    });
  }
  $('months').onclick = e => { const b = e.target.closest('[data-mk]'); if (b) goMonth(b.dataset.mk); };

  // --- Détail du calcul (clic sur un chiffre, bouton, mois du cumul, ou option « Affichage » pour l'afficher sous le résultat)
  const DOW = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  function calcHtml(mk) {
    const e = C.explain(S, mk), cls = e.days.filter(d => d.why === 'classe').length, mer = e.days.filter(d => d.why === 'mercredi' && d.dj).length;
    const sum = e.days.reduce((a, d) => a + d.dj, 0), s2 = n => (n > 1 ? 's' : '');
    let h = `<h3>1. Demi-journées de classe du mois : ${e.D}</h3>
      <p>${esc(Cal.zoneLabel(e.zone))} (même zone toute l'année) · rythme ${e.rhythm === '4' ? '4 jours' : '4,5 jours'}. Un jour de classe compte 2 demi-journées (matin et après-midi) ; le mercredi compte ${e.rhythm === '4' ? '0 (rythme 4 jours)' : '1 (matin seulement)'}. Sont retirés : week-ends, vacances de la zone, jours fériés et jours sans classe saisis.</p>
      <p class="calc-eq">${cls} jour${s2(cls)} de classe × 2${mer ? ` + ${mer} mercredi${s2(mer)} × 1` : ''} = ${sum} demi-journées${e.manual ? ` · total modifié à la main : ${e.D} au lieu de ${e.auto}` : ''}</p>
      <div class="tw calc-days"><table><caption class="sr-only">Statut de chaque jour du mois</caption><tr><th scope="col">Jour</th><th scope="col">Statut</th><th scope="col">Demi-j.</th></tr>` +
      e.days.map(d => `<tr class="${d.dj ? '' : 'off'}"><td>${DOW[d.dow]} ${+d.date.slice(8)}</td><td>${esc(d.label)}</td><td>${d.dj}</td></tr>`).join('') +
      `<tr class="tot"><td>Total</td><td></td><td>${sum}</td></tr></table></div>
      <h3>2. Présences possibles, absences et pourcentages</h3>`;
    h += e.levels.length ? e.levels.map(l => {
      const mv = l.moves.map(m => `${m.t === 'a' ? 'arrivée' : 'départ'}${m.date ? ' le ' + dfr(m.date) : ' (sans date : mois complet)'} : ${m.dj} demi-journées`);
      return `<p><b>${esc(l.l)}</b> : ${l.n} élève${s2(l.n)} × ${e.D} demi-journées = ${l.n * e.D}${mv.length ? ' + ' + mv.join(' + ') : ''} = <b>${l.poss}</b> présences possibles.<br>
        Absences : ${l.abs} → présences : ${l.real}. ${l.poss ? `<b>% présents : ${l.real} ÷ ${l.poss} = ${C.fmt(100 - l.pct)} %</b> ; % absents : ${l.abs} ÷ ${l.poss} = ${C.fmt(l.pct)} %.` : 'Saisissez les élèves pour voir les pourcentages.'}</p>`;
    }).join('') : '<p>Aucun niveau coché.</p>';
    if (e.levels.length) h += `<h3>3. Classe entière</h3><p>${e.tot.poss} présences possibles (somme des niveaux), ${e.tot.abs} absences, ${e.tot.real} présences : <b>${e.tot.poss ? C.fmt(100 - e.tot.pct) + ' % de présents' : '–'}</b>.</p>`;
    return h.replace(/ %/g, '\u00a0%'); // pas de « % » seul en début de ligne
  }
  function openCalc(mk) {
    $('calc-title').textContent = 'Détail du calcul · ' + C.mlabel(mk);
    $('calcBody').innerHTML = calcHtml(mk);
    $('dlgCalc').showModal();
  }
  $('stats').onclick = e => { if (e.target.closest('[data-calc]')) openCalc(S.month); };
  $('calcBtn').onclick = () => openCalc(S.month);
  $('recap').onclick = e => { const b = e.target.closest('[data-calc]'); if (b) openCalc(b.dataset.calc); };
  $('calLink').onclick = () => { $('dlgCal').close(); openCalc(S.month); };

  // --- Copie, fichiers, import
  $('copy').onclick = async () => {
    const { plain, html } = C.copyData(S, S.month), msg = t => { $('copied').textContent = t; };
    try {
      if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([plain], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
      else await navigator.clipboard.writeText(plain);
      msg('Copié : tableau sans mise en forme.');
    } catch (e) {
      try { await navigator.clipboard.writeText(plain); msg('Copié : tableau en texte.'); }
      catch (e2) { msg('Copie refusée : sélectionnez le tableau à la main.'); }
    }
  };
  // --- Sauvegarde et reprise : le fichier .json contient TOUT (saisie + zone, rythme, niveaux) ; il est vérifié avant d'être proposé
  let dl = null;
  try { window.claude.use('downloads').then(x => { dl = x; }).catch(() => {}); } catch (e) { /* hors artifact */ }
  function download(filename, data, type, onOk) {
    const msg = t => { $('fileMsg').textContent = t; };
    if (dl) return dl.save({ filename, data }).then(() => { msg('Fichier enregistré.'); if (onOk) onOk(); })
      .catch(x => msg(x && x.code === 'declined' ? 'Enregistrement annulé.' : 'Enregistrement impossible ici.'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg('Fichier enregistré.');
    if (onOk) onOk();
  }
  // Signature de la saisie (hors mois affiché) pour savoir si elle a changé depuis le dernier fichier
  const sigOf = () => { const t = JSON.stringify(Object.assign({}, S, { month: '' })); let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return String(h) + ':' + t.length; };
  const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(y => [y, x[y]])) : x);
  const goodIso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !isNaN(Date.parse(v));
  const nudgeOff = new Set();
  function saveUI() {
    const hasData = Object.keys(S.months).length > 0, dirty = P.saveSig !== sigOf(), when = goodIso(P.lastSave) ? new Date(P.lastSave).toLocaleDateString('fr-FR') : '';
    $('saveState').className = 'hint' + (hasData && (dirty || !when) ? ' bad' : '');
    $('saveState').textContent = !hasData ? "Aucune saisie à sauvegarder pour l'instant." : !when ? "Aucun fichier enregistré : enregistrez-en un pour garder une copie de sécurité." :
      dirty ? `Modifications depuis le dernier fichier (${when}) : pensez à enregistrer.` : `Dernier fichier enregistré le ${when} : tout est sauvegardé.`;
    const show = hasData && dirty && C.monthDone(S, S.month) && !nudgeOff.has(S.month);
    $('resetSave').textContent = $('saveState').textContent;
    $('saveNudge').hidden = !show;
    if (show) $('nudgeTxt').textContent = `${C.mlabel(S.month)} est terminé. Enregistrez un fichier pour garder une copie de sécurité.`;
  }
  function saveJson() {
    const data = Object.assign({ app: 'ComptAppel', savedAt: new Date().toISOString() }, S), text = JSON.stringify(data, null, 1);
    let ok = false;
    try { ok = canon(C.normalize(JSON.parse(text))) === canon(S); } catch (e) { /* ok reste faux */ }
    if (!ok) { $('fileMsg').textContent = "Sauvegarde annulée : le fichier ne se relirait pas à l'identique. Rechargez la page, puis réessayez."; return; }
    download(`comptappel-${S.year}.json`, text, 'application/json', () => { P.lastSave = data.savedAt; P.saveSig = sigOf(); savePrefs(); saveUI(); });
  }
  $('save').onclick = saveJson;
  $('nudgeSave').onclick = saveJson;
  $('nudgeLater').onclick = () => { nudgeOff.add(S.month); saveUI(); };
  $('pdf').onclick = () => {
    const b = Pdf.buildPdf(S, new Date().toLocaleDateString('fr-FR'));
    if (!b) { $('fileMsg').textContent = "Rien à exporter : saisissez d'abord un mois."; return; }
    download(`comptappel-${S.year}.pdf`, b, 'application/pdf');
  };
  let pending = null, pendingRaw = null;
  $('loadBtn').onclick = () => $('load').click();
  $('load').onchange = e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 2e6) { $('fileMsg').textContent = 'Fichier trop volumineux (2 Mo maximum).'; return; }
    f.text().then(t => {
      const o = JSON.parse(t);
      if (!o || typeof o !== 'object' || typeof o.months !== 'object') throw new Error('format');
      pendingRaw = o; pending = C.normalize(o);
      const n = Object.keys(pending.months).length, has = C.classSettingsIn(o);
      const lv = (has.levels ? pending.levels : S.levels).join(' ') || 'aucun', z = Cal.zoneLabel(has.zone ? pending.zone : S.zone), r = (has.rhythm ? pending.rhythm : S.rhythm) === '4' ? '4 jours' : '4,5 jours';
      $('importTxt').textContent = `« ${f.name} » : ${n} mois, niveaux ${lv}, ${z}, rythme ${r}, année ${pending.year}. Remplacer toute la saisie et les réglages actuels ?`;
      $('importAsk').hidden = false; $('fileMsg').textContent = '';
      $('importOk').focus();
    }).catch(() => { $('fileMsg').textContent = 'Fichier non reconnu.'; });
  };
  const closeAsk = t => { pending = pendingRaw = null; $('importAsk').hidden = true; $('fileMsg').textContent = t; $('loadBtn').focus(); };
  $('importOk').onclick = () => {
    const has = C.classSettingsIn(pendingRaw), raw = pendingRaw;
    S = pending;
    // Reprise : les réglages de la classe du fichier priment et deviennent ceux de l'usager ; s'ils n'y figurent pas, on garde les siens
    if (!has.zone && C.ZONES.includes(P.zone)) S.zone = P.zone;
    if (!has.rhythm && (P.rhythm === '4' || P.rhythm === '4.5')) S.rhythm = P.rhythm;
    if (!has.levels && Array.isArray(P.levels)) S.levels = C.normLevels(P.levels);
    P.zone = S.zone; P.rhythm = S.rhythm; P.levels = S.levels.slice();
    P.lastSave = goodIso(raw.savedAt) ? raw.savedAt : new Date().toISOString(); P.saveSig = sigOf(); // le fichier et la saisie sont identiques
    savePrefs(); save(); refresh(); closeAsk('Fichier chargé : saisie et réglages repris.');
  };
  $('importNo').onclick = () => closeAsk('Chargement annulé.');

  // --- Affichage : thème, texte, animations, contraste (P, applyPrefs : scripts/prefs.js)
  const dlg = $('settings');
  const isDark = () => ROOT.dataset.theme ? ROOT.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const themeBtn = () => { const t = isDark() ? 'Activer le mode clair' : 'Activer le mode sombre'; $('theme-toggle').setAttribute('aria-label', t); $('theme-toggle').title = t; };
  const savePrefs = () => { try { localStorage.setItem(PK, JSON.stringify(P)); } catch (e) { storeFail(); } applyPrefs(); themeBtn(); };
  function syncDlg() {
    for (const n of ['theme', 'text', 'motion']) {
      const v = String(P[n] || (n === 'text' ? '100' : 'auto')), r = dlg.querySelector(`input[name=${n}][value="${CSS.escape(v)}"]`);
      if (r) r.checked = true;
    }
    dlg.querySelector('input[name=contrast]').checked = P.contrast === true;
    dlg.querySelector('input[name=detail]').checked = P.detail === true;
  }
  $('help-open').onclick = () => $('help').showModal();
  $('settings-open').onclick = () => { syncDlg(); dlg.showModal(); };
  $('settings-close').onclick = $('settings-x').onclick = () => dlg.close();
  dlg.onclick = e => { if (e.target === dlg) dlg.close(); };
  dlg.onchange = e => { const t = e.target; if (!['theme', 'text', 'motion', 'contrast', 'detail'].includes(t.name)) return; P[t.name] = t.type === 'checkbox' ? t.checked : t.value; if (P.text === '100') delete P.text; savePrefs(); if (t.name === 'detail') results(); };
  // --- Remise à zéro (Affichage) : choix de ce qui est effacé, confirmation en tapant EFFACER, annulation possible
  let scope = 'data';
  const word = () => $('resetWord').value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const closeAskReset = () => { $('resetAsk').hidden = true; $('resetWord').value = ''; $('resetOk').disabled = true; };
  document.querySelectorAll('input[name=resetScope]').forEach(r => { r.onchange = () => { scope = r.value; closeAskReset(); }; });
  $('resetStart').onclick = () => {
    const n = Object.keys(S.months).length;
    $('resetTxt').textContent = scope === 'data' ? `Vous allez effacer toute la saisie (${n} mois). La zone, le rythme, les niveaux et l'affichage restent.`
      : scope === 'class' ? "Vous allez remettre la zone (A), le rythme (4 jours) et les niveaux (aucun) à leur valeur de départ. La saisie est conservée mais n'apparaît que pour les niveaux cochés."
      : `Vous allez tout effacer : ${n} mois de saisie, zone, rythme, niveaux, préférences d'affichage et état de sauvegarde. L'appli reviendra à son état de première ouverture.`;
    $('resetAsk').hidden = false; $('resetMsg').textContent = ''; $('resetWord').value = ''; $('resetOk').disabled = true; $('resetWord').focus();
  };
  $('resetWord').oninput = () => { $('resetOk').disabled = word() !== 'EFFACER'; };
  $('resetNo').onclick = closeAskReset;
  $('resetSaveBtn').onclick = saveJson;
  $('resetOk').onclick = () => {
    if (word() !== 'EFFACER') return;
    const snap = { S: JSON.parse(JSON.stringify(S)), P: JSON.parse(JSON.stringify(P)) };
    if (scope === 'all') { S = C.normalize(null); P = {}; }
    else if (scope === 'data') S.months = {};
    else { S.zone = 'A'; S.rhythm = '4'; S.levels = []; delete P.zone; delete P.rhythm; delete P.levels; }
    save(); savePrefs(); refresh(); syncDlg(); closeAskReset();
    undoSnap = snap; $('resetUndo').hidden = false;
    $('resetMsg').textContent = scope === 'data' ? 'Saisie effacée.' : scope === 'class' ? 'Réglages de la classe remis à zéro.' : 'Tout est remis à zéro.';
  };
  $('resetUndo').onclick = () => {
    if (!undoSnap) return;
    S = undoSnap.S; P = undoSnap.P; save(); savePrefs(); refresh(); syncDlg();
    $('resetUndo').hidden = true; $('resetMsg').textContent = 'Remise à zéro annulée : tout est revenu.';
  };
  $('prefs-reset').onclick = () => { P = { zone: P.zone, rhythm: P.rhythm, levels: P.levels }; savePrefs(); syncDlg(); }; // la réinitialisation de l'affichage garde les réglages de la classe
  $('theme-toggle').onclick = () => { P.theme = isDark() ? 'light' : 'dark'; savePrefs(); };

  document.querySelectorAll('.top .icon-btn[aria-label]').forEach(b => { b.title = b.getAttribute('aria-label'); });
  themeBtn();
  refresh();
})();
