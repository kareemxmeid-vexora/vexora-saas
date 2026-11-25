const T = {
ar:{dashboard:'لوحة التحكم',customers:'العملاء',invoices:'الفواتير',reports:'التقارير',team:'الفريق',billing:'الاشتراك',notifs:'الإشعارات',
login:'تسجيل الدخول',register:'إنشاء حساب',email:'البريد الإلكتروني',password:'كلمة المرور',name:'الاسم',company:'اسم الشركة',currency:'العملة',
tagline:'حصّل فلوسك في ميعادها',noacct:'ماعندكش حساب؟',haveacct:'عندك حساب؟',logout:'خروج',
outstanding:'المستحق',overdue:'المتأخر',collected:'المحصّل هذا الشهر',expected:'متوقع خلال 30 يوم',invoiced:'مفوتر',monthly:'آخر 6 شهور',topdebtors:'أكبر المدينين',
add:'إضافة',save:'حفظ',cancel:'إلغاء',del:'حذف',edit:'تعديل',phone:'الهاتف',notes:'ملاحظات',risk:'المخاطرة',balance:'المتبقي',amount:'المبلغ',
number:'رقم الفاتورة',customer:'العميل',issue:'تاريخ الإصدار',due:'تاريخ الاستحقاق',status:'الحالة',search:'بحث...',all:'الكل',
paid:'مدفوعة',open:'مفتوحة',partial:'جزئية',overdue_s:'متأخرة',pay:'تسجيل دفعة',remind:'تذكير',method:'طريقة الدفع',date:'التاريخ',
cash:'نقدًا',bank:'تحويل بنكي',instapay:'إنستاباي',vodafone_cash:'فودافون كاش',card:'بطاقة',other:'أخرى',
role:'الصلاحية',owner:'مالك',accountant:'محاسب',staff:'موظف',active:'نشط',disabled:'معطّل',
plan:'الباقة',current:'الحالية',choose:'اختيار',month:'/ شهر',unlimited:'غير محدود',usage:'الاستخدام',renews:'يتجدد في',
free:'مجانية',pro:'احترافية',business:'أعمال',aging:'أعمار الديون',export:'تصدير CSV',nodata:'لا توجد بيانات بعد',
current_b:'غير متأخر',copy:'نسخ الرسالة',openwa:'فتح واتساب',mark:'قراءة الكل',confirm:'متأكد؟',saved:'تم الحفظ',
paidfull:'مسدّد',lang:'English',balance_l:'الرصيد',pwd8:'8 أحرف على الأقل',reportsLocked:'التقارير متاحة في الباقة الاحترافية أو أعلى',
customers_l:'عملاء',users_l:'مستخدمين',invoices_l:'فواتير',days:'يوم',newcust:'عميل جديد',newinv:'فاتورة جديدة',gwnote:'الدفع الإلكتروني (Paymob/Stripe) يتفعّل بالإعدادات، حاليًا يتم تسجيل التغيير يدويًا',newuser:'مستخدم جديد'},
en:{dashboard:'Dashboard',customers:'Customers',invoices:'Invoices',reports:'Reports',team:'Team',billing:'Billing',notifs:'Notifications',
login:'Sign in',register:'Create account',email:'Email',password:'Password',name:'Name',company:'Company name',currency:'Currency',
tagline:'Get paid on time',noacct:"No account?",haveacct:'Have an account?',logout:'Log out',
outstanding:'Outstanding',overdue:'Overdue',collected:'Collected this month',expected:'Expected in 30 days',invoiced:'Invoiced',monthly:'Last 6 months',topdebtors:'Top debtors',
add:'Add',save:'Save',cancel:'Cancel',del:'Delete',edit:'Edit',phone:'Phone',notes:'Notes',risk:'Risk',balance:'Balance',amount:'Amount',
number:'Invoice #',customer:'Customer',issue:'Issue date',due:'Due date',status:'Status',search:'Search...',all:'All',
paid:'Paid',open:'Open',partial:'Partial',overdue_s:'Overdue',pay:'Record payment',remind:'Remind',method:'Method',date:'Date',
cash:'Cash',bank:'Bank transfer',instapay:'InstaPay',vodafone_cash:'Vodafone Cash',card:'Card',other:'Other',
role:'Role',owner:'Owner',accountant:'Accountant',staff:'Staff',active:'Active',disabled:'Disabled',
plan:'Plan',current:'Current',choose:'Choose',month:'/ month',unlimited:'Unlimited',usage:'Usage',renews:'Renews',
free:'Free',pro:'Pro',business:'Business',aging:'Aging report',export:'Export CSV',nodata:'No data yet',
current_b:'Not due',copy:'Copy message',openwa:'Open WhatsApp',mark:'Mark all read',confirm:'Are you sure?',saved:'Saved',
paidfull:'Settled',lang:'العربية',balance_l:'Balance',pwd8:'At least 8 characters',reportsLocked:'Reports need the Pro plan or higher',
customers_l:'customers',users_l:'users',invoices_l:'invoices',days:'days',newcust:'New customer',newinv:'New invoice',gwnote:'Online payments (Paymob/Stripe) are enabled via config; for now plan changes are recorded manually',newuser:'New user'}};
let lang = localStorage.lang || 'ar', token = localStorage.token || '', me = null;
const t = k => T[lang][k] || k;
const after = []; const defer = f => after.push(f);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2 }).format(n || 0) + ' ' + (me?.org.currency || '');
function toast(m, err) { const d = document.createElement('div'); d.textContent = m; if (err) d.className = 'err'; $('#toast').append(d); setTimeout(() => d.remove(), 3200); }
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && me) { logout(); throw new Error('Session expired'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(data.error || 'Error');
  return data;
}
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };
function setLang(l) { lang = l; localStorage.lang = l; document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'; }
function logout() { localStorage.removeItem('token'); token = ''; me = null; render(); }
const badge = s => `<span class="badge b-${s}">${t(s === 'overdue' ? 'overdue_s' : s)}</span>`;
const riskBar = r => `<span class="risk"><i style="width:${r}%;background:${r > 60 ? 'var(--bad)' : r > 30 ? 'var(--warn)' : 'var(--ok)'}"></i></span> ${r}`;

function form(title, fields, onSave, extra = '') {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<form class="card"><h3>${esc(title)}</h3>${fields.map(f => `<label>${esc(f.label)}</label>` + (f.type === 'select' ? `<select name="${f.name}">${f.options.map(o => `<option value="${esc(o[0])}" ${o[0] == f.value ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>` : `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.step ? `step="${f.step}"` : ''} ${f.req ? 'required' : ''}>`)).join('')}${extra}<div class="row" style="margin-top:16px"><button class="btn">${t('save')}</button><button type="button" class="btn ghost" id="x">${t('cancel')}</button></div></form>`;
  document.body.append(m);
  m.querySelector('#x').onclick = () => m.remove();
  m.querySelector('form').onsubmit = guard(async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); await onSave(d); m.remove(); });
}
const nav = [['dashboard', '📊'], ['customers', '👥'], ['invoices', '🧾'], ['reports', '📈'], ['team', '🔐'], ['billing', '💳']];
function shell(page, inner, notifs = 0) {
  const items = nav.filter(([k]) => k !== 'team' || me.perms.includes('users.manage'));
  return `<div class="layout"><aside class="side"><div class="logo"><img src="icon.svg" alt=""><div>VEX<span>ORA</span></div></div>
  <div style="color:var(--mute);font-size:12px;margin:0 6px 12px">${esc(me.org.name)}</div>
  ${items.map(([k, i]) => `<a href="#/${k}" class="${page === k ? 'on' : ''}">${i} ${t(k)}</a>`).join('')}
  <div style="flex:1"></div><a id="lg">🌐 ${t('lang')}</a><a id="lo">⎋ ${t('logout')}</a></aside>
  <main class="main"><div class="top"><h1>${t(page)}</h1><div class="row"><a class="bell btn ghost sm" href="#/notifs">🔔${notifs ? `<b>${notifs}</b>` : ''}</a><span style="color:var(--mute)">${esc(me.name)} · ${t(me.role)}</span></div></div>${inner}</main>
  <nav class="bottom">${items.slice(0, 5).map(([k, i]) => `<a href="#/${k}" class="${page === k ? 'on' : ''}"><span>${i}</span>${t(k)}</a>`).join('')}<a id="lg2"><span>🌐</span>${t('lang')}</a></nav></div>`;
}
function bindShell() {
  const sw = guard(async () => { setLang(lang === 'ar' ? 'en' : 'ar'); await api('/me', 'PATCH', { lang }); render(); });
  ['#lg', '#lg2'].forEach(s => $(s) && ($(s).onclick = sw)); $('#lo') && ($('#lo').onclick = logout);
}

function authView(mode) {
  $('#app').innerHTML = `<div class="auth"><form class="card"><div class="logo"><img src="icon.svg" alt=""><div>VEX<span>ORA</span></div></div><p class="sub">${t('tagline')}</p>
  ${mode === 'register' ? `<label>${t('company')}</label><input name="company" required maxlength="100"><label>${t('name')}</label><input name="name" required maxlength="100"><label>${t('currency')}</label><select name="currency">${['EGP', 'USD', 'SAR', 'AED', 'EUR'].map(c => `<option>${c}</option>`).join('')}</select>` : ''}
  <label>${t('email')}</label><input name="email" type="email" required><label>${t('password')}</label><input name="password" type="password" required minlength="8" placeholder="${t('pwd8')}">
  <button class="btn block">${t(mode)}</button><p class="sub" style="margin-top:14px"><a id="sw" href="#">${mode === 'login' ? t('noacct') + ' ' + t('register') : t('haveacct') + ' ' + t('login')}</a> · <a id="lg" href="#">${t('lang')}</a></p></form></div>`;
  $('#sw').onclick = e => { e.preventDefault(); authView(mode === 'login' ? 'register' : 'login'); };
  $('#lg').onclick = e => { e.preventDefault(); setLang(lang === 'ar' ? 'en' : 'ar'); authView(mode); };
  $('form').onsubmit = guard(async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); d.lang = lang;
    const r = await api('/auth/' + mode, 'POST', d); token = localStorage.token = r.token; me = r.user; setLang(me.lang); location.hash = '#/dashboard'; render(); });
}

const pages = {
async dashboard() {
  const d = await api('/dashboard'); const mx = Math.max(1, ...d.monthly.flatMap(m => [m.collected, m.invoiced]));
  return `<div class="grid"><div class="card kpi"><div class="l">${t('outstanding')}</div><div class="v">${money(d.outstanding)}</div></div>
  <div class="card kpi bad"><div class="l">${t('overdue')} (${d.counts.overdue})</div><div class="v">${money(d.overdue)}</div></div>
  <div class="card kpi ok"><div class="l">${t('collected')}</div><div class="v">${money(d.collected_this_month)}</div></div>
  <div class="card kpi gold"><div class="l">${t('expected')}</div><div class="v">${money(d.expected_30d)}</div></div></div>
  <div class="grid" style="margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
  <div class="card"><b>${t('monthly')}</b><div class="bars">${d.monthly.map(m => `<div class="c"><div class="pair" style="width:100%;justify-content:center"><div class="b" title="${t('invoiced')}" style="height:${m.invoiced / mx * 100}%;width:14px"></div><div class="b g" title="${t('collected')}" style="height:${m.collected / mx * 100}%;width:14px"></div></div><small>${m.month.slice(5)}</small></div>`).join('')}</div><small style="color:var(--mute)"><i style="color:var(--pri)">■</i> ${t("invoiced")} &nbsp; <i style="color:var(--gold)">■</i> ${t("collected")}</small></div>
  <div class="card"><b>${t('topdebtors')}</b>${d.top_debtors.length ? `<table>${d.top_debtors.map(x => `<tr><td><a href="#/customer/${x.id}">${esc(x.name)}</a></td><td>${money(x.balance)}</td></tr>`).join('')}</table>` : `<div class="empty">${t('nodata')}</div>`}</div></div>`;
},
async customers() {
  const rows = await api('/customers');
  window._cust = rows;
  defer(() => {
    $('#addc').onclick = () => custForm();
    document.querySelectorAll('[data-ec]').forEach(b => b.onclick = () => custForm(rows.find(c => c.id == b.dataset.ec)));
    document.querySelectorAll('[data-dc]').forEach(b => b.onclick = guard(async () => { if (confirm(t('confirm'))) { await api('/customers/' + b.dataset.dc, 'DELETE'); render(); } }));
  });
  return `<div class="row" style="margin-bottom:14px"><button class="btn" id="addc">＋ ${t('newcust')}</button></div><div class="card tw">${rows.length ? `<table><tr><th>${t('name')}</th><th>${t('phone')}</th><th>${t('outstanding')}</th><th>${t('overdue')}</th><th>${t('risk')}</th><th></th></tr>${rows.map(c => `<tr><td><a href="#/customer/${c.id}">${esc(c.name)}</a></td><td>${esc(c.phone || '')}</td><td>${money(c.outstanding)}</td><td>${money(c.overdue)}</td><td>${riskBar(c.risk)}</td><td>${me.perms.includes('customers.write') ? `<button class="btn ghost sm" data-ec="${c.id}">${t('edit')}</button>` : ''} ${me.perms.includes('customers.delete') ? `<button class="btn danger sm" data-dc="${c.id}">${t('del')}</button>` : ''}</td></tr>`).join('')}</table>` : `<div class="empty">${t('nodata')}</div>`}</div>`;
},
async customer(id) {
  const c = await api('/customers/' + id);
  return `<div class="card"><b>${esc(c.name)}</b> <span style="color:var(--mute)">${esc(c.phone || '')} ${esc(c.email || '')}</span><p>${esc(c.notes || '')}</p>${t('risk')}: ${riskBar(c.risk)}</div><div class="card tw" style="margin-top:14px">${invTable(c.invoices)}</div>`;
},
async invoices() {
  const st = new URLSearchParams(location.hash.split('?')[1] || '').get('s') || '';
  const rows = await api('/invoices' + (st ? '?status=' + st : ''));
  defer(() => { $('#addi').onclick = guard(invForm); $('#fs').onchange = e => { location.hash = '#/invoices' + (e.target.value ? '?s=' + e.target.value : ''); }; bindInvActions(); });
  return `<div class="row" style="margin-bottom:14px"><button class="btn" id="addi">＋ ${t('newinv')}</button><select id="fs" style="max-width:180px"><option value="">${t('all')}</option>${['open', 'partial', 'overdue', 'paid'].map(s => `<option value="${s}" ${st === s ? 'selected' : ''}>${t(s === 'overdue' ? 'overdue_s' : s)}</option>`).join('')}</select></div><div class="card tw">${invTable(rows)}</div>`;
},
async reports() {
  let r; try { r = await api('/reports/aging'); } catch (e) { return `<div class="card empty">🔒 ${t('reportsLocked')}<br><br><a class="btn gold" href="#/billing">${t('billing')}</a></div>`; }
  defer(() => $('#csv') && ($('#csv').onclick = guard(async () => { const txt = await api('/reports/export.csv'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv' })); a.download = 'invoices.csv'; a.click(); })));
  const L = { current: t('current_b'), d1_30: '1-30', d31_60: '31-60', d61_90: '61-90', d90_plus: '90+' };
  return `<div class="row" style="margin-bottom:14px"><button class="btn gold" id="csv">⬇ ${t('export')}</button></div><div class="grid">${Object.entries(r.buckets).map(([k, v]) => `<div class="card kpi ${k === 'd90_plus' ? 'bad' : ''}"><div class="l">${L[k]} ${k !== 'current' ? t('days') : ''}</div><div class="v">${money(v)}</div></div>`).join('')}</div>
  <div class="card tw" style="margin-top:14px"><b>${t('aging')}</b>${r.rows.length ? `<table><tr><th>${t('number')}</th><th>${t('customer')}</th><th>${t('balance')}</th><th>${t('due')}</th><th>${t('days')}</th></tr>${r.rows.map(x => `<tr><td>${esc(x.number)}</td><td>${esc(x.customer)}</td><td>${money(x.balance)}</td><td>${x.due_date}</td><td>${x.days_overdue}</td></tr>`).join('')}</table>` : `<div class="empty">${t('nodata')}</div>`}</div>`;
},
async team() {
  const us = await api('/users');
  defer(() => { $('#addu').onclick = () => form(t('newuser'), [{ name: 'name', label: t('name'), req: 1 }, { name: 'email', label: t('email'), type: 'email', req: 1 }, { name: 'password', label: t('password'), type: 'password', req: 1 }, { name: 'role', label: t('role'), type: 'select', options: [['staff', t('staff')], ['accountant', t('accountant')]] }], async d => { await api('/users', 'POST', d); render(); });
    document.querySelectorAll('[data-u]').forEach(b => b.onclick = guard(async () => { await api('/users/' + b.dataset.u, 'PATCH', { active: b.dataset.a !== '1' }); render(); }));
    document.querySelectorAll('[data-r]').forEach(s => s.onchange = guard(async () => { await api('/users/' + s.dataset.r, 'PATCH', { role: s.value }); toast(t('saved')); })); });
  return `<div class="row" style="margin-bottom:14px"><button class="btn" id="addu">＋ ${t('newuser')}</button></div><div class="card tw"><table><tr><th>${t('name')}</th><th>${t('email')}</th><th>${t('role')}</th><th>${t('status')}</th></tr>${us.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.id === me.id ? t('owner') : `<select data-r="${u.id}" style="width:auto">${['owner', 'accountant', 'staff'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${t(r)}</option>`).join('')}</select>`}</td><td>${u.id === me.id ? '' : `<button class="btn ghost sm" data-u="${u.id}" data-a="${u.active}">${u.active ? t('active') : t('disabled')}</button>`}</td></tr>`).join('')}</table></div>`;
},
async billing() {
  const b = await api('/billing');
  defer(() => document.querySelectorAll('[data-p]').forEach(x => x.onclick = guard(async () => { if (!me.perms.includes('billing.manage')) throw new Error('Owner only'); await api('/billing/change-plan', 'POST', { plan: x.dataset.p }); me = (await api('/me')).user; toast(t('saved')); render(); })));
  const lim = v => v == null ? t('unlimited') : v;
  return `<div class="plans">${Object.entries(b.plans).map(([k, p]) => `<div class="card plan ${b.plan === k ? 'cur' : ''}"><h3>${t(k)}</h3><div class="p">${p.price} <small>EGP ${t('month')}</small></div><ul><li>${lim(p.customers)} ${t('customers_l')}</li><li>${lim(p.users)} ${t('users_l')}</li><li>${lim(p.invoices)} ${t('invoices_l')}</li><li>${t('reports')}: ${p.reports ? '✔' : '✖'}</li></ul>${b.plan === k ? `<button class="btn ghost block" disabled>${t('current')}</button>` : `<button class="btn gold block" data-p="${k}">${t('choose')}</button>`}</div>`).join('')}</div>
  <div class="card" style="margin-top:14px"><b>${t('usage')}</b><p>${b.usage.customers} ${t('customers_l')} · ${b.usage.users} ${t('users_l')} · ${b.usage.invoices} ${t('invoices_l')}</p><p>${t('renews')}: ${b.renews_at || ''}</p><small style="color:var(--mute)">${t('gwnote')}</small></div>`;
},
async notifs() {
  const n = await api('/notifications'); await api('/notifications/read', 'POST');
  return `<div class="card">${n.items.length ? n.items.map(i => `<div class="notif ${i.read ? '' : 'un'}">${i.type === 'overdue' ? '🔴' : i.type === 'paid' ? '✅' : '🟡'} ${esc(lang === 'ar' ? i.message_ar : i.message_en)} <small style="color:var(--mute)">${i.created_at}</small></div>`).join('') : `<div class="empty">${t('nodata')}</div>`}</div>`;
}};
function invTable(rows) {
  if (!rows.length) return `<div class="empty">${t('nodata')}</div>`;
  return `<table><tr><th>${t('number')}</th><th>${t('customer')}</th><th>${t('amount')}</th><th>${t('balance')}</th><th>${t('due')}</th><th>${t('status')}</th><th></th></tr>${rows.map(i => `<tr><td>${esc(i.number)}</td><td>${esc(i.customer_name || '')}</td><td>${money(i.amount)}</td><td>${money(i.balance)}</td><td>${i.due_date}</td><td>${badge(i.status)}</td><td>${i.status !== 'paid' ? `${me.perms.includes('payments.write') ? `<button class="btn sm" data-pay="${i.id}" data-bal="${i.balance}">${t('pay')}</button>` : ''} <button class="btn ghost sm" data-rem="${i.id}">${t('remind')}</button>` : ''} ${me.perms.includes('invoices.delete') ? `<button class="btn danger sm" data-di="${i.id}">${t('del')}</button>` : ''}</td></tr>`).join('')}</table>`;
}
function bindInvActions() {
  document.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => form(t('pay'), [{ name: 'amount', label: t('amount'), type: 'number', step: '0.01', value: b.dataset.bal, req: 1 }, { name: 'method', label: t('method'), type: 'select', options: ['cash', 'bank', 'instapay', 'vodafone_cash', 'card', 'other'].map(m => [m, t(m)]) }, { name: 'paid_at', label: t('date'), type: 'date', value: new Date().toISOString().slice(0, 10) }], async d => { await api(`/invoices/${b.dataset.pay}/payments`, 'POST', d); toast(t('saved')); render(); }));
  document.querySelectorAll('[data-di]').forEach(b => b.onclick = guard(async () => { if (confirm(t('confirm'))) { await api('/invoices/' + b.dataset.di, 'DELETE'); render(); } }));
  document.querySelectorAll('[data-rem]').forEach(b => b.onclick = guard(async () => {
    const r = await api(`/invoices/${b.dataset.rem}/remind`, 'POST', { channel: 'whatsapp', lang });
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="card"><h3>${t('remind')}</h3><textarea rows="5" readonly>${esc(r.text)}</textarea><div class="row" style="margin-top:12px">${r.link ? `<a class="btn" target="_blank" rel="noopener" href="${esc(r.link)}">${t('openwa')}</a>` : ''}<button class="btn ghost" id="cp">${t('copy')}</button><button class="btn ghost" id="x">${t('cancel')}</button></div></div>`;
    document.body.append(m); m.querySelector('#x').onclick = () => m.remove(); m.querySelector('#cp').onclick = () => { navigator.clipboard?.writeText(r.text); toast(t('saved')); };
  }));
}
function custForm(c = {}) {
  form(c.id ? t('edit') : t('newcust'), [{ name: 'name', label: t('name'), value: c.name, req: 1 }, { name: 'phone', label: t('phone'), value: c.phone }, { name: 'email', label: t('email'), type: 'email', value: c.email }, { name: 'notes', label: t('notes'), value: c.notes }], async d => { await api(c.id ? '/customers/' + c.id : '/customers', c.id ? 'PUT' : 'POST', d); render(); });
}
async function invForm() {
  const cs = await api('/customers'); if (!cs.length) return toast(t('newcust') + ' ←', true);
  const td = new Date().toISOString().slice(0, 10), due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  form(t('newinv'), [{ name: 'customer_id', label: t('customer'), type: 'select', options: cs.map(c => [c.id, c.name]) }, { name: 'amount', label: t('amount'), type: 'number', step: '0.01', req: 1 }, { name: 'issue_date', label: t('issue'), type: 'date', value: td }, { name: 'due_date', label: t('due'), type: 'date', value: due, req: 1 }, { name: 'notes', label: t('notes') }], async d => { await api('/invoices', 'POST', d); render(); });
}

async function render() {
  setLang(lang);
  if (!token) return authView('login');
  try { if (!me) { me = (await api('/me')).user; setLang(me.lang); } } catch { return logout(); }
  const [p, arg] = (location.hash.replace('#/', '').split('?')[0] || 'dashboard').split('/');
  const page = pages[p] ? p : 'dashboard';
  try {
    const inner = await pages[page](arg);
    let unread = 0; try { unread = page === 'notifs' ? 0 : (await api('/notifications')).unread; } catch {}
    $('#app').innerHTML = shell(p === 'customer' ? 'customers' : page, inner, unread); bindShell(); after.splice(0).forEach(f => f());
  } catch (e) { $('#app').innerHTML = shell(page, `<div class="card empty">${esc(e.message)}</div>`); bindShell(); after.splice(0).forEach(f => f()); }
}
window.addEventListener('hashchange', render);
render();
