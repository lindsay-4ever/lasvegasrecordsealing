// Staff dashboard for Las Vegas Record Sealing leads (lasvegasrecordsealing.com/staff).
//
// Security model: this file and the key below are public on purpose. The
// database decides what anyone can see (supabase/16_staff_dashboard.sql):
// leads are returned only to a signed-in account on the staff list that has
// entered its 6-digit authenticator code. Staff can change only status,
// staff notes and the eligibility reminder.
//
// Everything a visitor typed into the form is shown with textContent, never
// as HTML, so a lead can't inject code into this page.
(() => {
  'use strict';

  // Don't run inside someone else's frame.
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location = window.self.location.href; } catch (e) { /* blocked */ }
    return;
  }

  const SUPABASE_URL = 'https://ubtmdxknrhdeqtixhyri.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_A2VvvVcgEaSiHWLRnGDSCg_4Bd46pXH'; // public key; database rules limit it
  const TZ = 'America/Los_Angeles';
  const MAX_LEADS = 2000;

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  // ── Labels ────────────────────────────────────────────────────────────────
  const STATUS = [
    ['new', 'New'], ['contacted', 'Contacted'], ['qualified', 'Qualified'],
    ['retained', 'Retained'], ['not_eligible', 'Not eligible'], ['closed', 'Closed'],
  ];
  const STATUS_LABEL = Object.fromEntries(STATUS);
  const OUTCOME = {
    packet: 'May be eligible now',
    waiting: 'Not eligible yet (waiting period)',
    contact: 'Needs our review',
  };
  const REASON = {
    no_charges: 'No charges were filed',
    dismissed: 'Charges were dismissed',
    wait_elapsed: 'Waiting period has passed',
    not_dismissed: 'Not convicted, charges not dismissed',
    unknown_conviction: 'Not sure if convicted',
    unknown_category: "Charge not in our list, or wait period unclear",
    special_case: 'Special case: wait depends on the facts',
    complex: 'Convicted, charge unknown',
    unknown_date: 'Sentence completion date missing',
  };
  const CONTACT_PREF = { phone: 'Phone call', text: 'Text', email: 'Email' };
  // Form questions, in the order the form asks them (from eligibility.html).
  const QUESTIONS = {
    stop: { q: 'Convicted of a charge that can never be sealed?', a: { no: 'No', yes: 'Yes' } },
    arrest: { q: 'What were you arrested for?', a: { felony: 'A felony', misdemeanor: 'A misdemeanor', unknown: "I'm not sure" } },
    q2a: { q: 'Were felony charges formally filed?', a: { yes_felony: 'Yes, felony charges were filed', yes_misd: 'No, misdemeanor charges were filed instead', no_charges: 'No formal charges were filed' } },
    q2b: { q: 'Were misdemeanor charges formally filed?', a: { yes_misd: 'Yes, misdemeanor charges were filed', yes_felony: 'No, felony charges were filed instead', no_charges: 'No formal charges were filed' } },
    q2c: { q: 'Were you convicted of any charge?', a: { yes: 'Yes', no: 'No', unknown: "I don't know" } },
    q3a: { q: 'Convicted of the felony charges?', a: { yes: 'Yes', no: 'No' } },
    q3b: { q: 'Convicted of the misdemeanor charges?', a: { yes: 'Yes', no: 'No' } },
    q4b: { q: 'Were the felony charges dismissed?', a: { yes: 'Yes', no: 'No', unknown: "I'm not sure" } },
    q5b: { q: 'Were the misdemeanor charges dismissed?', a: { yes: 'Yes', no: 'No', unknown: "I'm not sure" } },
    q6b: { q: 'Were the charges dismissed?', a: { yes: 'Yes', no: 'No' } },
    cantFind: { q: "Couldn't find their charge in the list" },
    chargeDescription: { q: 'Charge, in their words' },
    offenseDate: { q: 'When the offense happened' },
    offenseUnsure: { q: 'Not sure when the offense happened' },
    convictionType: { q: 'Conviction type' },
    convictionDate: { q: 'Conviction date' },
    convictionUnsure: { q: 'Not sure of conviction date' },
    completionDate: { q: 'Sentence completed' },
    completionMonth: { q: 'Sentence completed (month)' },
    completionUnsure: { q: 'Not sure when sentence was completed' },
  };
  // Already shown elsewhere on the lead.
  const SKIP_ANSWERS = new Set(['pendingOutcome', 'outcomeReason', 'selectedCharge', 'eligibleDate', 'waitYears', 'waitLabel']);

  // ── State ─────────────────────────────────────────────────────────────────
  const state = { leads: [], tab: 'new', status: '', q: '', openId: null, me: '', loadedAt: 0, enrollFactorId: null };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const VIEWS = ['loading', 'login', 'enroll', 'code', 'denied', 'app'];
  function show(view) { VIEWS.forEach((v) => { $('view-' + v).hidden = v !== view; }); }

  // Build elements safely: strings always become text, never HTML.
  function el(tag, props, ...kids) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else node.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }
  function setMsg(id, text, kind) {
    const box = $(id);
    if (!text) { box.hidden = true; box.textContent = ''; return; }
    box.textContent = text;
    box.className = 'msg ' + (kind || 'err');
    box.hidden = false;
  }
  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'One moment…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  function todayPacific() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }
  function dayDiff(fromIso, toIso) {
    const a = fromIso.split('-').map(Number); const b = toIso.split('-').map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  }
  // Dates stored as text may be "2015", "2015-06" or "2015-06-30".
  function fmtDate(v) {
    if (!v) return '';
    const s = String(v);
    const m = s.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
    if (!m) return s;
    const [, y, mo, d] = m;
    if (!mo) return y;
    const date = new Date(Date.UTC(+y, +mo - 1, d ? +d : 1));
    return date.toLocaleDateString('en-US', d ? { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' } : { timeZone: 'UTC', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function phoneHref(phone) {
    const raw = String(phone || '').trim();
    const digits = raw.replace(/[^\d+]/g, '');
    if (!digits) return null;
    if (digits.startsWith('+')) return digits;
    return digits.length === 10 ? '+1' + digits : digits;
  }
  function eligibleNote(l) {
    if (!l.eligible_date) return '';
    const diff = dayDiff(todayPacific(), l.eligible_date);
    if (diff > 0) return `in ${diff} day${diff === 1 ? '' : 's'}`;
    if (diff === 0) return 'eligible today';
    return 'eligible now';
  }
  // The QR code arrives as SVG text (sometimes already prefixed); encode it so
  // characters like "#" can't break the image.
  function qrDataUrl(qr) {
    const svg = String(qr || '').replace(/^data:image\/svg\+xml;[^,]*,/, '');
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function statusChip(s) { return el('span', { class: 'chip st-' + (STATUS_LABEL[s] ? s : 'closed'), text: STATUS_LABEL[s] || s || '—' }); }
  function answerText(key, val) {
    const q = QUESTIONS[key];
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (val === null || val === undefined || val === '') return '—';
    if (q && q.a && q.a[val]) return q.a[val];
    if (/Date$|Month$/.test(key)) return fmtDate(val);
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  function isEligibleSoon(l, today) {
    if (!l.eligibility_reminder || !l.eligible_date) return false;
    if (['retained', 'not_eligible', 'closed'].includes(l.status)) return false;
    if (l.eligible_date > addDays(today, 60)) return false;
    return l.eligible_date >= today || l.status === 'new';
  }
  const TABS = {
    new: (l) => l.status === 'new',
    soon: (l, today) => isEligibleSoon(l, today),
    special: (l) => !!l.special_case,
    all: () => true,
  };
  function matchesSearch(l, q) {
    if (!q) return true;
    const needle = q.toLowerCase().trim();
    const digits = needle.replace(/\D/g, '');
    const hay = [l.full_name, l.email, l.charge_name, l.charge_nrs, l.county, l.current_city, l.staff_notes, l.notes]
      .filter(Boolean).join(' ').toLowerCase();
    if (hay.includes(needle)) return true;
    if (digits) {
      if (String(l.phone || '').replace(/\D/g, '').includes(digits)) return true;
      if (l.lead_number != null && String(l.lead_number) === needle.replace(/^#/, '')) return true;
    }
    return false;
  }

  // ── Sign-in flow ──────────────────────────────────────────────────────────
  async function route() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { show('login'); $('loginEmail').focus(); return; }
    state.me = (session.user && session.user.email) || '';

    const { data: aal, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) { show('login'); setMsg('loginMsg', 'Please sign in again.'); return; }
    if (aal.currentLevel !== 'aal2') {
      if (aal.nextLevel === 'aal2') { show('code'); $('codeInput').value = ''; $('codeInput').focus(); }
      else await startEnroll();
      return;
    }

    const { data: ok, error: rpcErr } = await sb.rpc('is_staff');
    if (rpcErr) {
      $('deniedText').textContent = "The staff dashboard isn't fully set up yet (the database step is missing). Ask Lindsay to finish setup.";
      show('denied'); return;
    }
    if (!ok) {
      $('deniedText').textContent = `You're signed in as ${state.me}, but this email isn't on the staff list yet. Ask Lindsay to add it.`;
      show('denied'); return;
    }
    $('meEmail').textContent = state.me;
    show('app');
    await loadLeads();
  }

  async function startEnroll() {
    show('enroll');
    setMsg('enrollMsg', '');
    $('enrollQr').removeAttribute('src');
    $('enrollSecret').textContent = '';
    $('enrollCode').value = '';
    // Clear any half-finished setup from an earlier visit.
    const { data: list } = await sb.auth.mfa.listFactors();
    for (const f of (list && list.all) || []) {
      if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' });
    if (error) { setMsg('enrollMsg', "Couldn't start setup: " + error.message); return; }
    state.enrollFactorId = data.id;
    $('enrollQr').src = qrDataUrl(data.totp.qr_code);
    $('enrollSecret').textContent = (data.totp.secret || '').replace(/(.{4})/g, '$1 ').trim();
    $('enrollCode').focus();
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('loginMsg', '');
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    if (!email || !password) { setMsg('loginMsg', 'Enter your email and password.'); return; }
    busy($('loginBtn'), true, 'Signing in…');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    busy($('loginBtn'), false);
    if (error) {
      setMsg('loginMsg', /invalid/i.test(error.message) ? 'That email and password don’t match. Check them and try again.' : error.message);
      return;
    }
    $('loginPassword').value = '';
    await route();
  });

  $('enrollForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('enrollCode').value.replace(/\D/g, '');
    if (code.length !== 6) { setMsg('enrollMsg', 'Enter the 6-digit code from the app.'); return; }
    if (!state.enrollFactorId) { await startEnroll(); return; }
    busy($('enrollBtn'), true, 'Checking…');
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: state.enrollFactorId, code });
    busy($('enrollBtn'), false);
    if (error) { setMsg('enrollMsg', 'That code didn’t work. Wait for a new code in the app and try again.'); return; }
    state.enrollFactorId = null;
    await route();
  });

  $('codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('codeMsg', '');
    const code = $('codeInput').value.replace(/\D/g, '');
    if (code.length !== 6) { setMsg('codeMsg', 'Enter the 6-digit code from the app.'); return; }
    busy($('codeBtn'), true, 'Checking…');
    const { data: list, error: listErr } = await sb.auth.mfa.listFactors();
    const factor = !listErr && list && list.totp && list.totp[0];
    if (!factor) { busy($('codeBtn'), false); await startEnroll(); return; }
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    busy($('codeBtn'), false);
    if (error) { setMsg('codeMsg', 'That code didn’t work. Wait for a new code in the app and try again.'); $('codeInput').select(); return; }
    await route();
  });

  async function signOut() {
    if (!confirmDiscard()) return;
    closeDrawer(true);
    await sb.auth.signOut();
    state.leads = [];
    $('leadRows').replaceChildren();
    show('login');
    $('loginEmail').focus();
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action="signout"]');
    if (t) { e.preventDefault(); signOut(); }
  });
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && !$('view-app').hidden) { state.leads = []; $('leadRows').replaceChildren(); closeDrawer(true); show('login'); }
  });

  // ── Leads list ────────────────────────────────────────────────────────────
  async function loadLeads() {
    setMsg('listMsg', '');
    $('refreshBtn').disabled = true;
    const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false }).limit(MAX_LEADS);
    $('refreshBtn').disabled = false;
    if (error) { setMsg('listMsg', "Couldn't load leads: " + error.message + '. Try Refresh, or sign out and back in.'); return; }
    state.leads = data || [];
    state.loadedAt = Date.now();
    renderList();
    if (state.openId) {
      const still = state.leads.find((l) => l.id === state.openId);
      if (!still) closeDrawer(true);
    }
  }

  function renderList() {
    const today = todayPacific();
    for (const key of Object.keys(TABS)) {
      $('count-' + key).textContent = state.leads.filter((l) => TABS[key](l, today)).length;
    }
    let rows = state.leads.filter((l) => TABS[state.tab](l, today));
    if (state.status) rows = rows.filter((l) => l.status === state.status);
    rows = rows.filter((l) => matchesSearch(l, state.q));
    if (state.tab === 'soon') rows.sort((a, b) => String(a.eligible_date).localeCompare(String(b.eligible_date)));

    const tbody = $('leadRows');
    tbody.replaceChildren(...rows.map(rowFor));
    const empty = $('emptyState');
    if (!state.leads.length) { empty.textContent = 'No leads yet. New eligibility forms will show up here.'; empty.hidden = false; }
    else if (!rows.length) { empty.textContent = 'No leads match these filters.'; empty.hidden = false; }
    else empty.hidden = true;

    const tabName = { new: 'new', soon: 'eligible within 60 days', special: 'special-case', all: 'total' }[state.tab];
    $('summary').textContent = `${rows.length} ${tabName} lead${rows.length === 1 ? '' : 's'}` +
      (state.leads.length >= MAX_LEADS ? ` (showing the newest ${MAX_LEADS})` : '') +
      ` · updated ${new Date(state.loadedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }

  function rowFor(l) {
    const charge = l.charge_name || (l.answers && l.answers.chargeDescription ? `“${l.answers.chargeDescription}”` : '—');
    const tr = el('tr', { class: 'lead-row' + (l.id === state.openId ? ' is-open' : ''), tabindex: 0, dataset: { id: l.id } },
      el('td', { class: 'c-num num', text: l.lead_number != null ? '#' + l.lead_number : '' }),
      el('td', { class: 'c-when' }, fmtDateTime(l.created_at)),
      el('td', { class: 'c-name' },
        el('span', { class: 'name', text: l.full_name || '—' }),
        l.special_case ? el('span', { class: 'flag', text: 'Special case' }) : null),
      el('td', { class: 'c-contact' }, l.phone || '', el('span', { class: 'sub', text: CONTACT_PREF[l.preferred_contact] ? 'Prefers ' + CONTACT_PREF[l.preferred_contact].toLowerCase() : '' })),
      el('td', { class: 'c-charge' }, charge, l.charge_category ? el('span', { class: 'sub', text: l.charge_category }) : null),
      el('td', { class: 'c-result' }, OUTCOME[l.outcome] || l.outcome || '—', l.outcome_reason ? el('span', { class: 'sub', text: REASON[l.outcome_reason] || l.outcome_reason }) : null),
      el('td', { class: 'c-elig' }, l.eligible_date ? fmtDate(l.eligible_date) : '', l.eligible_date ? el('span', { class: 'sub', text: eligibleNote(l) }) : null),
      el('td', { class: 'c-status' }, statusChip(l.status)),
    );
    return tr;
  }

  $('leadRows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr.lead-row');
    if (tr) openLead(tr.dataset.id);
  });
  $('leadRows').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const tr = e.target.closest('tr.lead-row');
    if (tr) { e.preventDefault(); openLead(tr.dataset.id); }
  });
  document.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    renderList();
  }));
  const statusSel = $('statusFilter');
  STATUS.forEach(([v, label]) => statusSel.append(el('option', { value: v, text: label })));
  statusSel.addEventListener('change', () => { state.status = statusSel.value; renderList(); });
  $('search').addEventListener('input', () => { state.q = $('search').value; renderList(); });
  $('refreshBtn').addEventListener('click', () => loadLeads());
  // Pick up new leads when someone comes back to the tab.
  window.addEventListener('focus', () => {
    if (!$('view-app').hidden && Date.now() - state.loadedAt > 60000 && !isDirty()) loadLeads();
  });

  // ── Lead detail ───────────────────────────────────────────────────────────
  function kv(pairs) {
    const dl = el('dl', { class: 'kv' });
    for (const [k, v] of pairs) {
      if (v === null || v === undefined || v === '') continue;
      dl.append(el('dt', { text: k }), el('dd', null, v));
    }
    return dl;
  }
  function section(title, ...kids) { return el('div', { class: 'section' }, el('h3', { text: title }), ...kids); }

  function openLead(id) {
    if (state.openId && state.openId !== id && !confirmDiscard()) return;
    const l = state.leads.find((x) => x.id === id);
    if (!l) return;
    state.openId = id;
    document.querySelectorAll('.lead-row').forEach((r) => r.classList.toggle('is-open', r.dataset.id === id));
    $('drawerTitle').textContent = (l.lead_number != null ? `#${l.lead_number} · ` : '') + (l.full_name || 'Lead');
    $('drawerSub').textContent = 'Submitted ' + fmtDateTime(l.created_at) + ' (Pacific)' + (l.site === 'nevadasealingrecords' ? ' · Nevada Sealing Records' : '');
    renderDrawer(l);
    $('backdrop').hidden = false;
    $('drawer').hidden = false;
    $('d-status').focus();
  }

  function renderDrawer(l) {
    const body = $('drawerBody');
    const tel = phoneHref(l.phone);
    const where = [l.current_city, l.current_state, l.current_country].filter(Boolean).join(', ');

    // Staff section (editable)
    const statusSelect = el('select', { id: 'd-status' }, STATUS.map(([v, label]) => el('option', { value: v, text: label, selected: v === l.status })));
    const notes = el('textarea', { id: 'd-notes', placeholder: 'Calls, messages, next steps…' });
    notes.value = l.staff_notes || '';
    const reminder = l.eligible_date && (l.outcome === 'waiting' || l.eligibility_reminder) ? el('label', { class: 'check' },
      el('input', { type: 'checkbox', id: 'd-reminder', checked: !!l.eligibility_reminder }),
      el('span', null, `Remind us when they become eligible (${fmtDate(l.eligible_date)}). Untick if they asked not to be contacted.`)) : null;
    const saveBtn = el('button', { class: 'btn-primary', type: 'button', id: 'd-save', text: 'Save' });
    const lastUpd = el('span', { class: 'muted small', id: 'd-updated', text: l.updated_at ? `Last changed by ${l.updated_by || 'staff'} · ${fmtDateTime(l.updated_at)}` : '' });
    const staff = el('div', { class: 'section staff-section' },
      el('h3', { text: 'Follow-up' }),
      el('label', { class: 'field', for: 'd-status', text: 'Status' }), statusSelect,
      el('label', { class: 'field', for: 'd-notes', text: 'Staff notes (only staff see these)' }), notes,
      reminder,
      el('div', { class: 'save-row' }, saveBtn, lastUpd),
      el('div', { id: 'd-msg', class: 'msg', role: 'alert', hidden: true }),
      el('div', { id: 'd-unsaved', class: 'unsaved', hidden: true },
        el('span', { text: 'You have unsaved changes.' }),
        el('button', { class: 'btn-primary', type: 'button', id: 'd-unsaved-save', text: 'Save' }),
        el('button', { class: 'btn-ghost', type: 'button', id: 'd-unsaved-discard', text: 'Discard' })),
    );

    // Contact
    const actions = el('div', { class: 'contact-actions' },
      tel ? el('a', { href: 'tel:' + tel, text: 'Call' }) : null,
      tel ? el('a', { href: 'sms:' + tel, text: 'Text' }) : null,
      l.email ? el('a', { href: 'mailto:' + encodeURIComponent(l.email).replace(/%40/g, '@'), text: 'Email' }) : null);
    const contact = section('Contact',
      kv([
        ['Phone', l.phone],
        ['Email', l.email],
        ['Prefers', CONTACT_PREF[l.preferred_contact] || l.preferred_contact],
        ['Lives in', where],
        ['County of the case', l.county],
      ]), actions);

    // Result
    const resultKids = [kv([
      ['Form result', OUTCOME[l.outcome] || l.outcome],
      ['Why', REASON[l.outcome_reason] || l.outcome_reason],
      ['Eligible on', l.eligible_date ? `${fmtDate(l.eligible_date)} (${eligibleNote(l)})` : null],
      ['Waiting period', Number.isInteger(l.wait_years) ? (l.wait_years === 0 ? 'None' : `${l.wait_years} year${l.wait_years === 1 ? '' : 's'}`) : null],
    ])];
    if (l.special_case) {
      resultKids.push(el('div', { style: 'margin-top:10px;' },
        el('strong', { text: 'Special case. Check before advising.' }),
        l.special_case_note ? el('div', { style: 'margin-top:6px;' },
          el('span', { class: 'ai-flag', text: 'AI Answer — Attorney Stover should revise' }),
          el('div', { class: 'note-box', text: l.special_case_note })) : null));
    }
    const result = section('Result', ...resultKids);

    // Charge
    const charge = section('Charge', kv([
      ['Charge', l.charge_name || (l.answers && l.answers.chargeDescription ? `Not in list: “${l.answers.chargeDescription}”` : null)],
      ['NRS', l.charge_nrs],
      ['Class', l.charge_category],
      ['Convicted', fmtDate(l.conviction_date)],
      ['Sentence completed', fmtDate(l.completion_date)],
    ]));

    // Their notes
    const theirNotes = l.notes ? section('Their message', el('div', { class: 'note-box', text: l.notes })) : null;

    // All answers
    const answers = l.answers || {};
    const keys = Object.keys(QUESTIONS).filter((k) => k in answers)
      .concat(Object.keys(answers).filter((k) => !(k in QUESTIONS) && !SKIP_ANSWERS.has(k)));
    const answerPairs = keys.filter((k) => answers[k] !== '' && answers[k] !== null && answers[k] !== false)
      .map((k) => [QUESTIONS[k] ? QUESTIONS[k].q : k, answerText(k, answers[k])]);
    const answersSec = answerPairs.length ? section('Form answers', kv(answerPairs)) : null;

    // Technical
    const tech = el('div', { class: 'section' }, el('details', null,
      el('summary', { text: 'Consent and technical details' }),
      el('div', { style: 'margin-top:10px;' }, kv([
        ['Consent', l.consent ? 'Agreed' : 'No'],
        ['Consent wording', l.consent_text],
        ['Page', l.page_url],
        ['Browser', l.user_agent],
        ['Lead ID', l.id],
      ]))));

    body.replaceChildren(staff, contact, result, charge, theirNotes || '', answersSec || '', tech);

    const markDirty = () => { $('d-unsaved').hidden = !isDirty(); };
    statusSelect.addEventListener('change', markDirty);
    notes.addEventListener('input', markDirty);
    if (reminder) $('d-reminder').addEventListener('change', markDirty);
    saveBtn.addEventListener('click', saveLead);
    $('d-unsaved-save').addEventListener('click', saveLead);
    $('d-unsaved-discard').addEventListener('click', () => closeDrawer(true));
  }

  function currentLead() { return state.leads.find((x) => x.id === state.openId); }
  function formValues() {
    const r = $('d-reminder');
    const l = currentLead();
    return {
      status: $('d-status').value,
      staff_notes: $('d-notes').value.trim() ? $('d-notes').value : null,
      eligibility_reminder: r ? r.checked : !!(l && l.eligibility_reminder),
    };
  }
  function isDirty() {
    if (!state.openId || $('drawer').hidden) return false;
    const l = currentLead();
    if (!l) return false;
    const v = formValues();
    return v.status !== l.status || (v.staff_notes || '') !== (l.staff_notes || '') || v.eligibility_reminder !== !!l.eligibility_reminder;
  }
  function confirmDiscard() {
    if (!isDirty()) return true;
    $('d-unsaved').hidden = false;
    $('d-unsaved').scrollIntoView({ block: 'nearest' });
    return false;
  }

  async function saveLead() {
    const l = currentLead();
    if (!l) return;
    const v = formValues();
    const btn = $('d-save');
    busy(btn, true, 'Saving…');
    const { data, error } = await sb.from('leads').update(v).eq('id', l.id).select('*').single();
    busy(btn, false);
    if (error) {
      const box = $('d-msg'); box.className = 'msg err'; box.hidden = false;
      box.textContent = "Couldn't save: " + error.message;
      return;
    }
    const i = state.leads.findIndex((x) => x.id === l.id);
    if (i >= 0) state.leads[i] = data;
    $('d-unsaved').hidden = true;
    const box = $('d-msg'); box.className = 'msg ok'; box.hidden = false; box.textContent = 'Saved.';
    $('d-updated').textContent = data.updated_at ? `Last changed by ${data.updated_by || 'staff'} · ${fmtDateTime(data.updated_at)}` : '';
    renderList();
  }

  function closeDrawer(force) {
    if (!force && !confirmDiscard()) return;
    const wasOpen = state.openId;
    state.openId = null;
    $('drawer').hidden = true;
    $('backdrop').hidden = true;
    $('drawerBody').replaceChildren();
    document.querySelectorAll('.lead-row.is-open').forEach((r) => r.classList.remove('is-open'));
    if (wasOpen) {
      const row = document.querySelector(`.lead-row[data-id="${CSS.escape(wasOpen)}"]`);
      if (row) row.focus();
    }
  }
  $('closeDrawer').addEventListener('click', () => closeDrawer(false));
  $('backdrop').addEventListener('click', () => closeDrawer(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('drawer').hidden && !$('pwDialog').open) closeDrawer(false);
  });
  window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  // ── Change password ───────────────────────────────────────────────────────
  $('pwBtn').addEventListener('click', () => {
    $('pwNew').value = ''; $('pwConfirm').value = ''; setMsg('pwMsg', '');
    $('pwDialog').showModal();
    $('pwNew').focus();
  });
  $('pwCancel').addEventListener('click', () => $('pwDialog').close());
  $('pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = $('pwNew').value; const b = $('pwConfirm').value;
    if (a.length < 12) { setMsg('pwMsg', 'Use at least 12 characters.'); return; }
    if (a !== b) { setMsg('pwMsg', "The two passwords don't match."); return; }
    busy($('pwSave'), true, 'Saving…');
    const { error } = await sb.auth.updateUser({ password: a });
    busy($('pwSave'), false);
    if (error) { setMsg('pwMsg', "Couldn't change it: " + error.message); return; }
    $('pwNew').value = ''; $('pwConfirm').value = '';
    setMsg('pwMsg', 'Password changed.', 'ok');
  });

  // ── Start ─────────────────────────────────────────────────────────────────
  route().catch((err) => {
    show('login');
    setMsg('loginMsg', "Something went wrong loading the page. Refresh and try again. (" + (err && err.message ? err.message : err) + ')');
  });
})();
