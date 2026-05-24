// ─────────────────────────────────────────────
// STOKDOSYA — Ana Uygulama JavaScript'i
// ─────────────────────────────────────────────

// ----- VERİ KATMANI -----
const DATA_KEY = 'tazedepo_data';

// ★ BURAYA KALICI GOOGLE SCRIPT URL'NİZİ YAPIŞTIRIN ★
const HARD_CODED_API_URL = '';

// ★ GITHUB YAPILANDIRMASI (Kalıcı — tarayıcı silinse bile durur) ★
const HARD_CODED_GITHUB = {
  owner: 'mustafaorhan-dev',
  repo: 'STOKDOSYA',
  path: 'data/stok.json',
  token: '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' // GitHub Personal Access Token (settings'ten de girilebilir)
};

let data = { products: {}, transactions: [], users: [], activeUser: '', settings: {} };
let nextPartiCounter = 1;
let _syncLock = false;

function getApiUrl() {
  return HARD_CODED_API_URL || (data.settings && data.settings.apiUrl) || '';
}

// ----- GITHUB API (Birincil Depolama) -----
function getGithubConfig() {
  const cfg = data.settings && data.settings.github;
  return {
    owner: (cfg && cfg.owner) || HARD_CODED_GITHUB.owner,
    repo: (cfg && cfg.repo) || HARD_CODED_GITHUB.repo,
    path: (cfg && cfg.path) || HARD_CODED_GITHUB.path,
    token: (cfg && cfg.token) || HARD_CODED_GITHUB.token
  };
}

function githubApiUrl() {
  const c = getGithubConfig();
  if (!c.owner || !c.repo || !c.path || !c.token) return null;
  return `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${c.path}`;
}

async function githubLoad() {
  const url = githubApiUrl();
  if (!url) return null;
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: 'token ' + getGithubConfig().token,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    if (!resp.ok) {
      if (resp.status === 404) return null;
      throw new Error('GitHub API hatası: ' + resp.status);
    }
    const json = await resp.json();
    const binary = atob(json.content.replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decoded = new TextDecoder('utf-8').decode(bytes);
    const parsed = JSON.parse(decoded);
    document.getElementById('cloud-status-text').textContent = '✅ GitHub: veri yüklendi';
    return parsed;
  } catch (e) {
    document.getElementById('cloud-status-text').textContent = '⚠️ GitHub: ' + e.message;
    return null;
  }
}

async function githubSave(dataToSave) {
  const url = githubApiUrl();
  if (!url || _syncLock) return;
  _syncLock = true;
  try {
    // Önce mevcut dosyanın SHA'sını al (güncelleme için gerekli)
    let sha = null;
    const existing = await fetch(url, {
      headers: {
        Authorization: 'token ' + getGithubConfig().token,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    if (existing.ok) {
      const existingJson = await existing.json();
      sha = existingJson.sha;
    }

    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(JSON.stringify(dataToSave, null, 2));
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    const content = btoa(binary);
    const body = {
      message: 'STOKDOSYA otomatik kayıt',
      content: content
    };
    if (sha) body.sha = sha;

    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: 'token ' + getGithubConfig().token,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error('GitHub yazma hatası: ' + resp.status + ' — ' + errText);
    }

    document.getElementById('cloud-status-text').textContent = '✅ GitHub: eşitlendi';
  } catch (e) {
    document.getElementById('cloud-status-text').textContent = '⚠️ GitHub: ' + e.message;
  } finally {
    _syncLock = false;
  }
}

async function githubTest() {
  const c = getGithubConfig();
  if (!c.owner || !c.repo || !c.token) {
    toast('GitHub bilgileri eksik!', 'error');
    return;
  }
  const overlay = document.getElementById('loading-overlay');
  overlay.style.display = 'flex';
  document.getElementById('loading-text').textContent = 'GitHub bağlantısı test ediliyor...';
  try {
    const resp = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}`, {
      headers: {
        Authorization: 'token ' + c.token,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    const json = await resp.json();
    if (resp.ok) {
      toast(`✅ GitHub bağlantısı başarılı! Depo: ${json.full_name}`, 'success');
      document.getElementById('connection-status').innerHTML =
        `<span style="color:var(--success);">✅ GitHub: ${json.full_name} — ${json.private ? 'Gizli' : 'Açık'} repo</span>`;
    } else {
      toast('❌ GitHub hatası: ' + (json.message || 'bilinmiyor'), 'error');
    }
  } catch (e) {
    toast('❌ Bağlantı hatası: ' + e.message, 'error');
  } finally {
    overlay.style.display = 'none';
  }
}

function initData() {
  if (!data.users) data.users = [];
  if (!data.users.length) {
    data.users = [{ name: 'Depo Şefi', role: 'Yönetici' }, { name: 'Yardımcı Şef Ali', role: 'Depo Sorumlusu' }];
    data.activeUser = 'Depo Şefi';
  }
  if (!data.settings) data.settings = {};
  if (!data.settings.apiUrl) data.settings.apiUrl = '';
  if (!data.settings.autoBackupTime) data.settings.autoBackupTime = '17:00';
  if (data.settings.autoBackupEnabled === undefined) data.settings.autoBackupEnabled = false;
  if (!data.settings.theme) data.settings.theme = 'light';
  if (!data.settings.autoSync) data.settings.autoSync = true;
  if (!data.products) data.products = {};
  if (!data.transactions) data.transactions = [];
  if (!data.tenders) data.tenders = [];
  if (!data.companies) data.companies = [];
  // Mevcut ürünlerden firma adlarını topla
  if (data.products) {
    Object.values(data.products).forEach(p => {
      if (p.companyName && !data.companies.includes(p.companyName)) {
        data.companies.push(p.companyName);
      }
    });
    data.companies.sort((a, b) => a.localeCompare(b));
  }
}

// ----- DRIVE SENKRONİZASYON -----
async function driveKaydet() {
  const url = getApiUrl();
  if (!url || _syncLock) return;
  _syncLock = true;
  try {
    // no-cors ile çalışması için form verisi olarak gönder
    const formData = new URLSearchParams();
    formData.append('action', 'save');
    formData.append('data', JSON.stringify(data));
    await fetch(url, {
      method: 'POST', mode: 'no-cors',
      body: formData
    });
    document.getElementById('cloud-status-text').textContent = 'Bulut: eşitlendi ✅';
  } catch (e) {
    document.getElementById('cloud-status-text').textContent = 'Bulut: bağlantı hatası ⚠';
  } finally {
    _syncLock = false;
  }
}

async function driveYukle() {
  return null; // Google Drive desteği kaldırıldı, GitHub kullanın
}

function getLocalSettings() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      return cached.settings || {};
    }
  } catch (e) {}
  return {};
}

async function loadData() {
  // Önce GitHub'dan yüklemeyi dene
  const githubData = await githubLoad();
  if (githubData) {
    data = githubData;
    data.settings = { ...data.settings, ...getLocalSettings() };
    initData();
    saveDataLocal();
    return;
  }

  // GitHub yoksa localStorage'a bak (cache)
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.products && Object.keys(cached.products).length > 0) {
        data = cached;
      }
    }
  } catch (e) { /* ignore */ }
  initData();
  saveDataLocal();
}

function saveDataLocal() {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

function saveData() {
  saveDataLocal();
  // Otomatik GitHub senkronu
  if (data.settings && data.settings.autoSync && githubApiUrl()) {
    githubSave(data);
  }
}

// ----- TEMA -----
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  document.getElementById('theme-toggle').textContent = theme === 'light' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = data.settings.theme || 'dark';
  data.settings.theme = current === 'dark' ? 'light' : 'dark';
  applyTheme(data.settings.theme);
  saveData();
}



// ----- YARDIMCI -----
function formatDate(iso) {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return d + '.' + m + '.' + y;
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ----- KİŞİ ADI AYIKLAMA -----
function extractPerson(note) {
  if (!note) return '';
  let clean = note.replace(/[^A-ZİŞĞÜÖÇ\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ').filter(w => w.length >= 2);
  if (words.length >= 1) return words.join(' ');
  return '';
}

function getAllPersons() {
  const set = new Set();
  data.transactions.forEach(t => {
    const p = extractPerson(t.note);
    if (p) set.add(p);
  });
  return [...set].sort();
}

function refreshPersonFilter() {
  const select = document.getElementById('daily-person-filter');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Tüm Personel</option>';
  getAllPersons().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === current) opt.selected = true;
    select.appendChild(opt);
  });
}

function populateYearSelect(selectId, selectedYear) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const cyil = new Date().getFullYear();
  select.innerHTML = '';
  for (let y = 2024; y <= cyil + 5; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + ' Yılı';
    if (y === (selectedYear || cyil)) opt.selected = true;
    select.appendChild(opt);
  }
}

// ----- AYLAR -----
const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const AY_INDEX = new Date().getMonth();

// ----- CHART JS YÖNETİMİ -----
let _yearChart = null;

function _chartUnit() {
  const el = document.getElementById('year-product-filter');
  if (!el) return '';
  const secili = el.value;
  if (!secili) return '';
  for (const p of Object.values(data.products)) {
    if (p.name === secili) return p.unit || '';
  }
  for (const t of data.transactions) {
    if (t.productName === secili && t.unit) return t.unit;
  }
  return '';
}

const barValuePlugin = {
  id: 'barValuePlugin',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const birim = _chartUnit();
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      meta.data.forEach((bar, index) => {
        const val = dataset.data[index];
        if (val === 0) return;
        ctx.fillStyle = dataset.borderColor || '#fff';
        ctx.font = 'bold 11px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(val + (birim ? ' ' + birim : ''), bar.x, bar.y - 3);
      });
    });
  }
};

function populateYearProductFilter() {
  const select = document.getElementById('year-product-filter');
  if (!select) return;
  const current = select.value;
  const urunler = [...new Set(data.transactions.map(t => t.productName).filter(Boolean))].sort();
  select.innerHTML = '<option value="">Tüm Ürünler</option>';
  urunler.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === current) opt.selected = true;
    select.appendChild(opt);
  });
}

function renderYearChart(yil) {
  const canvas = document.getElementById('year-chart');
  if (!canvas) return;
  if (_yearChart) { _yearChart.destroy(); _yearChart = null; }

  const urunFiltre = document.getElementById('year-product-filter').value;

  const girisAylik = AYLAR.map((_, i) =>
    data.transactions.filter(t => {
      const d = new Date(t.date);
      return t.type === 'giris' && d.getMonth() === i && d.getFullYear() === yil
        && (!urunFiltre || t.productName === urunFiltre);
    }).reduce((s, t) => s + t.amount, 0)
  );
  const cikisAylik = AYLAR.map((_, i) =>
    data.transactions.filter(t => {
      const d = new Date(t.date);
      return t.type === 'cikis' && d.getMonth() === i && d.getFullYear() === yil
        && (!urunFiltre || t.productName === urunFiltre);
    }).reduce((s, t) => s + t.amount, 0)
  );

  const ctx = canvas.getContext('2d');
  _yearChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: AYLAR,
      datasets: [
        { label: 'Giriş', data: girisAylik, backgroundColor: 'rgba(34,197,94,0.7)', borderColor: '#22c55e', borderWidth: 1 },
        { label: 'Çıkış', data: cikisAylik, backgroundColor: 'rgba(239,68,68,0.7)', borderColor: '#ef4444', borderWidth: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.15)' } },
        y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.15)' } }
      }
    },
    plugins: [barValuePlugin]
  });
}

// ----- TOAST -----
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  el.innerHTML = `${icons[type] || 'ℹ️'} ${msg}`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '0.3s'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ----- NAVIGASYON -----
function navigateTo(target) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

  const navItem = document.querySelector(`.nav-item[data-target="${target}"]`);
  if (navItem) navItem.classList.add('active');

  const view = document.getElementById(target);
  if (view) view.classList.add('active');

  const titles = {
    'dashboard': 'Genel Bakış', 'warehouse': 'Anbar Listesi', 'entry': 'Mal Kabul (Giriş)',
    'exit': 'Ürün Çıkış', 'daily': 'Günlük İşlemler', 'month-view': 'Aylık Rapor',
    'years-view': 'Yıllık Raporlar', 'stt-tracking': 'STT Takibi', 'tender-tracking': 'İhale Takip', 'suppliers': 'Tedarikçiler', 'settings-view': 'Ayarlar & Bulut'
  };
  document.getElementById('page-title').textContent = titles[target] || 'STOKDOSYA';

  // view'e ozel yenilemeler
  if (target === 'dashboard') refreshDashboard();
  if (target === 'warehouse') refreshWarehouse();
  if (target === 'month-view') refreshMonthView();
  if (target === 'years-view') refreshYearsView();
  if (target === 'stt-tracking') refreshSttTracking();
  if (target === 'tender-tracking') refreshTenders();
  if (target === 'suppliers') refreshSuppliers();
  if (target === 'entry') refreshEntryForm();
  if (target === 'exit') refreshExitForm();
  if (target === 'daily') {
    document.getElementById('daily-date').value = todayStr();
    refreshDailyView();
  }
  if (target === 'settings-view') refreshSettings();
}

// ----- AY MENÜSÜ OLUŞTUR -----
function buildMonthMenu() {
  const select = document.getElementById('months-year-select');
  const prevYil = parseInt(select.value);
  populateYearSelect('months-year-select', prevYil || new Date().getFullYear());
  const yil = parseInt(select.value) || new Date().getFullYear();
  const container = document.getElementById('months-menu');
  container.innerHTML = AYLAR.map((ay, i) => {
    const aktif = (i === AY_INDEX && yil === new Date().getFullYear()) ? ' active' : '';
    const count = ayHareketSayisi(i, yil);
    return `<a href="#" class="nav-item${aktif}" data-month="${i}" data-year="${yil}" onclick="goToMonth(${i}, ${yil})">
      <i class="fa-regular fa-calendar"></i>
      <span>${ay} ${yil}</span>
      <span class="month-badge">${count}</span>
    </a>`;
  }).join('');
}

function ayHareketSayisi(ay, yil) {
  return data.transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === ay && d.getFullYear() === yil;
  }).length;
}

function goToMonth(ay, yil) {
  window._selectedMonth = ay;
  window._selectedYear = yil;
  document.querySelectorAll('.nav-item[data-month]').forEach(n => n.classList.remove('active'));
  const el = document.querySelector(`.nav-item[data-month="${ay}"]`);
  if (el) el.classList.add('active');
  navigateTo('month-view');
}

// ----- DASHBOARD -----
function refreshDashboard() {
  const prods = Object.values(data.products);
  document.getElementById('total-varieties').textContent = prods.length;
  document.getElementById('total-stock').textContent = _fmt(prods.reduce((s, p) => s + p.stock, 0));

  const kritik = prods.filter(p => p.criticalLevel > 0 && p.stock <= p.criticalLevel);
  document.getElementById('critical-count').textContent = kritik.length;
  document.getElementById('critical-badge-container').className = `icon-box ${kritik.length ? 'st-warning' : 'st-green'}`;

  const bugun = todayStr();
  const bugunHareket = data.transactions.filter(t => t.date === bugun);
  document.getElementById('today-transactions').textContent = bugunHareket.length;

  // Son hareketler tablosu (tümü, en yeniler üstte)
  const tbody = document.getElementById('recent-transactions-body');
  const hareketler = [...data.transactions].reverse();
  if (!hareketler.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px;">Henüz hareket kaydı yok.</td></tr>';
  } else {
    tbody.innerHTML = hareketler.map(t => {
      const tipEl = t.type === 'giris' ? '<span style="color:var(--success);font-weight:700;">GİRİŞ</span>' : '<span style="color:var(--accent);font-weight:700;">ÇIKIŞ</span>';
      const birim = t.unit || (data.products[t.partiNo] && data.products[t.partiNo].unit) || '';
      return `<tr><td style="font-weight:600;">${t.partiNo}</td><td>${formatDate(t.date)}</td><td>${tipEl}</td><td>${t.productName}</td><td>${_fmt(t.amount)}</td><td>${birim}</td><td style="color:var(--text-secondary);">${t.note || '-'}</td></tr>`;
    }).join('');
  }

  // Kritik stok yan panel
  const kritikDiv = document.getElementById('critical-stock-list');
  if (!kritik.length) {
    kritikDiv.innerHTML = '<p style="color:var(--text-secondary);text-align:center;font-size:0.9rem;">✅ Tüm stoklar normal seviyede.</p>';
  } else {
    kritikDiv.innerHTML = kritik.map(p => `
      <div style="display:flex;align-items:center;gap:12px;background:var(--warning-light);padding:12px;border-radius:var(--border-radius-sm);border:1px solid rgba(234,179,8,0.2);">
        <i class="fa-solid fa-triangle-exclamation" style="color:var(--warning);font-size:18px;"></i>
        <div style="flex:1;"><strong>${p.name}</strong><br><span style="font-size:13px;color:var(--text-secondary);">Stok: ${_fmt(p.stock)} / Limit: ${p.criticalLevel} ${p.unit}</span></div>
        <span style="background:#422006;color:var(--warning);padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;">KRİTİK</span>
      </div>
    `).join('');
  }

  // Tarihi Yaklaşan / Geçen Ürünler
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiring = Object.values(data.products).filter(p => p.stt).map(p => {
    const sttDate = new Date(p.stt + 'T00:00:00');
    const fark = Math.ceil((sttDate - now) / (1000 * 60 * 60 * 24));
    return { ...p, sttGunFark: fark };
  }).filter(p => p.sttGunFark <= 3);
  expiring.sort((a, b) => a.sttGunFark - b.sttGunFark);

  const expDiv = document.getElementById('expiring-products-list');
  if (!expiring.length) {
    expDiv.innerHTML = '<p style="color:var(--text-secondary);text-align:center;font-size:0.9rem;">✅ 3 gün içinde son kullanma tarihi yaklaşan ürün yok.</p>';
  } else {
    expDiv.innerHTML = expiring.map(p => {
      const gecti = p.sttGunFark < 0;
      const uyari = gecti ? 'GEÇTİ' : (p.sttGunFark === 0 ? 'BUGÜN' : p.sttGunFark + ' gün');
      const bg = gecti ? 'var(--accent)' : 'var(--warning)';
      const bgLight = gecti ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)';
      return `
      <div style="display:flex;align-items:center;gap:12px;background:${bgLight};padding:12px;border-radius:var(--border-radius-sm);border:1px solid ${bg}40;">
        <i class="fa-regular fa-clock" style="color:${bg};font-size:18px;"></i>
        <div style="flex:1;"><strong>${p.name}</strong> [${p.partiNo}]<br><span style="font-size:13px;color:var(--text-secondary);">STT: ${formatDate(p.stt)} — Stok: ${_fmt(p.stock)} ${p.unit}</span></div>
        <span style="background:${bg};color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;">${uyari}</span>
      </div>`;
    }).join('');
  }

  // Personel İşlem Özeti
  const personMap = {};
  data.transactions.forEach(t => {
    const p = extractPerson(t.note);
    if (!p) return;
    if (!personMap[p]) personMap[p] = { giris: 0, cikis: 0, adet: 0 };
    personMap[p].adet++;
    if (t.type === 'giris') personMap[p].giris += t.amount;
    else personMap[p].cikis += t.amount;
  });
  const personList = Object.entries(personMap).sort((a, b) => b[1].adet - a[1].adet);
  const personDiv = document.getElementById('personel-summary-list');
  if (!personList.length) {
    personDiv.innerHTML = '<p style="color:var(--text-secondary);text-align:center;font-size:0.9rem;">Henüz işlem yok.</p>';
  } else {
    personDiv.innerHTML = personList.map(([isim, v]) => `
      <div style="display:flex;align-items:center;gap:12px;background:var(--bg-primary);padding:10px 12px;border-radius:var(--border-radius-sm);border:1px solid var(--border-color);cursor:pointer;" onclick="document.getElementById('daily-person-filter').value='${isim}';navigateTo('daily');refreshDailyView();">
        <i class="fa-regular fa-user" style="color:var(--primary);font-size:18px;"></i>
        <div style="flex:1;"><strong>${isim}</strong><br><span style="font-size:12px;color:var(--text-secondary);">${_fmt(v.giris)} giriş / ${_fmt(v.cikis)} çıkış (${v.adet} işlem)</span></div>
        <span style="font-size:12px;color:var(--primary);font-weight:600;">Detay →</span>
      </div>
    `).join('');
  }
}

// ----- ANBAR / WAREHOUSE -----
let _warehouseFilter = 'ALL';
let _hideZeroStock = false;
let _onlyCritical = false;

function sttDurum(stt) {
  if (!stt) return { text: '-', cls: '' };
  const bugun = new Date();
  bugun.setHours(0, 0, 0, 0);
  const sttDate = new Date(stt + 'T00:00:00');
  const fark = Math.ceil((sttDate - bugun) / (1000 * 60 * 60 * 24));
  const goster = formatDate(stt);
  if (fark < 0) return { text: goster + ' (GEÇTİ)', cls: 'color:var(--accent);font-weight:800;' };
  if (fark <= 3) return { text: goster + ' (' + fark + ' gün)', cls: 'color:var(--warning);font-weight:700;' };
  return { text: goster, cls: '' };
}

function refreshWarehouse() {
  const prods = Object.values(data.products);
  const search = (document.getElementById('anbar-search').value || '').toLowerCase();

  let filtered = prods;
  if (_warehouseFilter !== 'ALL') filtered = filtered.filter(p => p.category === _warehouseFilter);
  if (_hideZeroStock) filtered = filtered.filter(p => p.stock > 0);
  if (_onlyCritical) filtered = filtered.filter(p => p.criticalLevel > 0 && p.stock <= p.criticalLevel);
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search) || p.partiNo.toLowerCase().includes(search));

  // Filtre durumunu göster
  const badge = document.getElementById('filter-active-badge');
  const aktifFiltreler = [];
  if (_hideZeroStock) aktifFiltreler.push('Sıfır stok gizli');
  if (_onlyCritical) aktifFiltreler.push('Kritik altı');
  if (_warehouseFilter !== 'ALL') aktifFiltreler.push('Kategori: ' + _warehouseFilter);
  if (aktifFiltreler.length) {
    badge.style.display = 'inline';
    badge.textContent = '🔍 ' + aktifFiltreler.join(' | ');
  } else {
    badge.style.display = 'none';
  }

  const colCount = 8;
  const tbody = document.getElementById('anbar-body');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="' + colCount + '" style="text-align:center;color:var(--text-muted);padding:40px;">Eşleşen ürün bulunamadı.</td></tr>';
    return;
  }

  filtered.sort((a, b) => a.name.localeCompare(b.name));
  tbody.innerHTML = filtered.map(p => {
    const kritik = p.criticalLevel > 0 && p.stock <= p.criticalLevel;
    const stokClass = kritik ? 'color:var(--accent);font-weight:800;' : '';
    const stt = sttDurum(p.stt);
    return `<tr>
      <td style="font-weight:600;color:var(--primary);">${p.partiNo}</td>
      <td><span style="background:var(--primary-light);color:var(--primary);padding:2px 10px;border-radius:999px;font-size:12px;">${p.category}</span></td>
      <td><strong>${p.name}</strong></td>
      <td style="${stokClass}">${_fmt(p.stock)} ${p.unit}</td>
      <td>${p.unit}</td>
      <td>${p.criticalLevel}</td>
      <td style="${stt.cls}">${stt.text}</td>
      <td style="text-align:right;">
        <button class="btn-ui btn-sm btn-outline" onclick="editProduct('${p.partiNo}')" title="Düzenle"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-ui btn-sm btn-outline" onclick="deleteProduct('${p.partiNo}')" title="Sil" style="color:var(--accent);"><i class="fa-solid fa-trash-can"></i></button>
      </td>
    </tr>`;
  }).join('');
}

// Kategori filtreleme + Anbar filtre butonları
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('category-filter-container').addEventListener('click', (e) => {
    if (e.target.classList.contains('category-tag')) {
      document.querySelectorAll('.category-tag').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      _warehouseFilter = e.target.dataset.category;
      refreshWarehouse();
    }
  });

  document.getElementById('anbar-search').addEventListener('input', refreshWarehouse);

  document.getElementById('filter-zero-btn').addEventListener('click', () => {
    _hideZeroStock = !_hideZeroStock;
    document.getElementById('filter-zero-btn').classList.toggle('active', _hideZeroStock);
    refreshWarehouse();
  });

  document.getElementById('filter-critical-btn').addEventListener('click', () => {
    _onlyCritical = !_onlyCritical;
    document.getElementById('filter-critical-btn').classList.toggle('active', _onlyCritical);
    if (_onlyCritical) document.getElementById('filter-zero-btn').classList.remove('active');
    refreshWarehouse();
  });
});

// ----- LISTE AL (DISARI AKTAR) -----
function _exportData() {
  const prods = Object.values(data.products).sort((a, b) => a.name.localeCompare(b.name));
  const now = new Date(); now.setHours(0,0,0,0);
  return prods.map(p => {
    const fark = p.stt ? Math.ceil((new Date(p.stt+'T00:00:00') - now) / (1000*60*60*24)) : '';
    const sttDurum = fark !== '' ? (fark < 0 ? 'GEÇTİ' : fark + ' gün') : '—';
    const stokBitti = p.stock <= 0 ? ' STOKTA BİTTİ' : '';
    return { ...p, sttDurum, stokBitti };
  });
}

function _htmlExcelBlob(rows, headers, fileName) {
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const attr = ' style="border:1px solid #ccc;padding:6px 8px;"';
  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sayfa1</x:Name></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>';
  html += '<tr>' + headers.map(h => '<th' + attr + '>' + esc(h) + '</th>').join('') + '</tr>';
  rows.forEach(r => {
    html += '<tr>' + r.map(v => '<td' + attr + '>' + esc(v) + '</td>').join('') + '</tr>';
  });
  html += '</table></body></html>';
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportXLSX() {
  const rows = _exportData();
  const headers = ['Parti No','Kategori','Ürün Adı','Stok Miktarı','Birim','Kritik Limit','STT','STT Durumu','Durum'];
  const data = rows.map(p => {
    const durum = p.stokBitti ? p.stokBitti.trim() : (p.stock <= p.criticalLevel ? 'KRİTİK' : '');
    return [p.partiNo, p.category, p.name, _fmt(p.stock), p.unit,
      p.criticalLevel, formatDate(p.stt) || '—', p.sttDurum, durum];
  });
  _htmlExcelBlob(data, headers, 'stok_listesi.xls');
  toast('Excel dosyası indirildi.', 'success');
}

function exportWord() {
  const rows = _exportData();
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>Stok Listesi</title></head>
<body><h2>Stok Listesi</h2>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial;font-size:13px;width:100%;">
<thead><tr style="background:#e2e8f0;">
<th>Parti No</th><th>Kategori</th><th>Ürün Adı</th><th>Stok</th><th>Birim</th><th>Kritik Limit</th><th>STT</th><th>STT Durumu</th><th>Durum</th>
</tr></thead>
<tbody>${rows.map(p => {
    const durum = p.stokBitti ? p.stokBitti : (p.stock <= p.criticalLevel ? ' KRİTİK' : '');
    return `<tr><td>${p.partiNo}</td><td>${p.category}</td><td>${p.name}</td><td align="right">${_fmt(p.stock)}</td><td>${p.unit}</td><td align="right">${p.criticalLevel}</td><td>${formatDate(p.stt) || '—'}</td><td>${p.sttDurum}</td><td>${durum.trim()}</td></tr>`;
  }).join('\n')}</tbody></table></body></html>`;
  const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stok_listesi.doc';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Word dosyası indirildi.', 'success');
}

function exportPrint() {
  const rows = _exportData();
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Stok Listesi - Yazdır</title>
    <style>
      body { font-family:Arial; padding:20px; }
      h2 { margin-bottom:12px; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      th, td { border:1px solid #ccc; padding:6px 8px; text-align:left; }
      th { background:#e2e8f0; }
      .bitti { color:red; font-weight:700; }
    </style></head>
    <body><h2>Stok Listesi</h2>
    <table><thead><tr>
      <th>Parti No</th><th>Kategori</th><th>Ürün Adı</th><th>Stok</th><th>Birim</th><th>Kritik</th><th>STT</th><th>STT Durumu</th><th>Durum</th>
    </tr></thead>
    <tbody>${rows.map(p => {
      const durum = p.stokBitti ? 'STOKTA BİTTİ' : (p.stock <= p.criticalLevel ? 'KRİTİK' : '');
      const cls = p.stokBitti ? ' class="bitti"' : '';
      return `<tr${cls}><td>${p.partiNo}</td><td>${p.category}</td><td>${p.name}</td><td align="right">${_fmt(p.stock)}</td><td>${p.unit}</td><td align="right">${p.criticalLevel}</td><td>${formatDate(p.stt) || '—'}</td><td>${p.sttDurum}</td><td>${durum}</td></tr>`;
    }).join('\n')}</tbody></table>
    <p style="margin-top:20px;color:#888;font-size:11px;">Oluşturulma: ${new Date().toLocaleDateString('tr-TR')}</p>
    <script>window.print();<\/script>
    </body></html>
  `);
  w.document.close();
}

// ----- STT LISTE AL -----
function _sttExportData() {
  const now = new Date(); now.setHours(0,0,0,0);
  return Object.values(data.products).filter(p => p.stt).map(p => {
    const sttDate = new Date(p.stt + 'T00:00:00');
    const fark = Math.ceil((sttDate - now) / (1000*60*60*24));
    const uyari = fark < 0 ? 'GEÇTİ' : (fark === 0 ? 'BUGÜN' : fark + ' gün');
    const durum = (p.stock <= 0) ? 'STOKTA BİTTİ' : (p.criticalLevel > 0 && p.stock <= p.criticalLevel ? 'KRİTİK' : '—');
    return [p.partiNo, p.name, formatDate(p.stt), uyari, _fmt(p.stock) + ' ' + p.unit, durum];
  });
}

function sttExportXLSX() {
  const rows = _sttExportData();
  _htmlExcelBlob(rows, ['Parti No','Ürün','STT','Kalan Gün','Stok','Durum'], 'stt_takip.xls');
  toast('Excel dosyası indirildi.', 'success');
}
function sttExportWord() {
  const rows = _sttExportData();
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>STT Takip</title></head>
<body><h2>STT Takip Listesi</h2>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial;font-size:13px;width:100%;">
<thead><tr style="background:#e2e8f0;"><th>Parti No</th><th>Ürün</th><th>STT</th><th>Kalan Gün</th><th>Stok</th><th>Durum</th></tr></thead>
<tbody>${rows.map(r => '<tr><td>' + r.join('</td><td>') + '</td></tr>').join('\n')}</tbody></table></body></html>`;
  const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'stt_takip.doc'; a.click();
  URL.revokeObjectURL(a.href);
  toast('Word dosyası indirildi.', 'success');
}
function sttExportPrint() {
  const rows = _sttExportData();
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>STT Takip - Yazdır</title>
    <style>body{font-family:Arial;padding:20px;}table{width:100%;border-collapse:collapse;font-size:12px;}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}th{background:#e2e8f0;}</style></head>
    <body><h2>STT Takip Listesi</h2>
    <table><thead><tr><th>Parti No</th><th>Ürün</th><th>STT</th><th>Kalan Gün</th><th>Stok</th><th>Durum</th></tr></thead>
    <tbody>${rows.map(r => '<tr><td>' + r.join('</td><td>') + '</td></tr>').join('\n')}</tbody></table>
    <p style="margin-top:20px;color:#888;font-size:11px;">Oluşturulma: ${new Date().toLocaleDateString('tr-TR')}</p>
    <script>window.print();<\/script></body></html>`);
  w.document.close();
}

// Dropdown ac/kapa
function _toggleMenu(btnId, menuId) {
  const menu = document.getElementById(menuId);
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
function _closeMenu(menuId) {
  document.getElementById(menuId).style.display = 'none';
}

document.addEventListener('click', (e) => {
  // Anbar export
  if (e.target.closest('#export-btn')) { _toggleMenu('export-btn', 'export-menu'); return; }
  if (!e.target.closest('.export-dropdown') && !e.target.closest('.export-menu')) {
    _closeMenu('export-menu');
  }
  const opt = e.target.closest('.export-option');
  if (opt) {
    _closeMenu('export-menu');
    const fmt = opt.dataset.format;
    if (fmt === 'xlsx') exportXLSX();
    else if (fmt === 'word') exportWord();
    else if (fmt === 'print') exportPrint();
  }
  // STT export
  if (e.target.closest('#stt-export-btn')) { _toggleMenu('stt-export-btn', 'stt-export-menu'); return; }
  if (!e.target.closest('.export-dropdown') && !e.target.closest('#stt-export-menu')) {
    _closeMenu('stt-export-menu');
  }
  const sopt = e.target.closest('.stt-export-option');
  if (sopt) {
    _closeMenu('stt-export-menu');
    const fmt = sopt.dataset.format;
    if (fmt === 'xlsx') sttExportXLSX();
    else if (fmt === 'word') sttExportWord();
    else if (fmt === 'print') sttExportPrint();
  }
});

// ----- ÜRÜN CRUD -----
function openProductModal(editPartiNo) {
  const modal = document.getElementById('new-product-modal');
  const form = document.getElementById('new-product-form');
  form.reset();
  document.getElementById('np-is-edit').value = 'false';
  document.getElementById('submit-product-btn').innerHTML = '<i class="fa-solid fa-save"></i> Kartı Oluştur';

  if (editPartiNo) {
    const p = data.products[editPartiNo];
    if (!p) return;
    document.getElementById('np-is-edit').value = 'true';
    document.getElementById('np-id').value = p.partiNo;
    document.getElementById('np-id').readOnly = true;
    document.getElementById('np-name').value = p.name;
    document.getElementById('np-category').value = p.category;
    document.getElementById('np-unit').value = p.unit;
    document.getElementById('np-stock').value = _fmt(p.stock);
    document.getElementById('np-critical').value = p.criticalLevel;
    document.getElementById('np-stt').value = p.stt || '';
    document.getElementById('np-company').value = p.companyName || '';
    document.getElementById('submit-product-btn').innerHTML = '<i class="fa-solid fa-pen"></i> Kartı Güncelle';
  } else {
    document.getElementById('np-id').readOnly = false;
    document.getElementById('np-id').value = '';
    document.getElementById('np-stt').value = '';
    document.getElementById('np-company').value = '';
  }

  // Firma listesini datalist'e doldur
  const dlist = document.getElementById('company-list');
  if (dlist) {
    dlist.innerHTML = (data.companies || []).map(c => `<option value="${c}">`).join('');
  }

  modal.classList.add('show');
}

function editProduct(partiNo) { openProductModal(partiNo); }

// Ürün modalını kapat
document.getElementById('close-modal').addEventListener('click', () => {
  document.getElementById('new-product-modal').classList.remove('show');
});
document.getElementById('new-product-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.target.classList.remove('show');
});

// Ürün kaydet
document.getElementById('new-product-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const isEdit = document.getElementById('np-is-edit').value === 'true';
  const partiNo = document.getElementById('np-id').value.trim().toUpperCase();
  const name = document.getElementById('np-name').value.trim();
  const category = document.getElementById('np-category').value;
  const unit = document.getElementById('np-unit').value;
  const stock = _parseAmount(document.getElementById('np-stock').value) || 0;
  const critical = parseInt(document.getElementById('np-critical').value) || 0;
  const stt = document.getElementById('np-stt').value || '';
  const companyName = document.getElementById('np-company').value.trim().toUpperCase() || '';

  if (!partiNo || !name) { toast('Parti No ve ürün adı gerekli!', 'error'); return; }
  if (!companyName) {
    toast('⚠️ Tedarikçi girilmedi. İhale takibi için Tedarikçiler sayfasından ekleyebilirsiniz.', 'warning');
  }

  if (isEdit) {
    const p = data.products[partiNo];
    if (p) {
      const fark = stock - p.stock;
      p.name = name; p.category = category; p.unit = unit;
      p.stock = stock; p.criticalLevel = critical; p.stt = stt; p.companyName = companyName;

      // Stok artışını ihaleye işle
      if (fark > 0 && p.companyName && data.tenders && data.tenders.length) {
        const eslesen = data.tenders.filter(t =>
          t.companyName === p.companyName && t.product === p.name
        );
        eslesen.forEach(t => { t.delivered += fark; });
        if (eslesen.length) {
          saveData();
          toast(`✅ ${_fmt(fark)} ${p.unit} "${p.companyName}" ihaleye işlendi.`, 'success');
        }
      }

      saveData();
      toast('Ürün güncellendi.', 'success');
    }
  } else {
    if (data.products[partiNo]) { toast('Bu Parti No zaten var!', 'error'); return; }
    // Aynı isimde stokta olan ürün varsa engelle (stok 0 ise eklenebilir)
    const ayniIsimVar = Object.values(data.products).some(p =>
      p.name.toUpperCase() === name.toUpperCase() && p.stock > 0
    );
    if (ayniIsimVar) {
      toast(`"${name}" stokta bulunuyor. Önce stoktaki ürünü kullanın veya sıfırlayın.`, 'error');
      return;
    }
    data.products[partiNo] = {
      partiNo, name, category, unit, stock, criticalLevel: critical, stt: stt, companyName,
      createdAt: new Date().toISOString()
    };
    if (stock > 0) {
      data.transactions.push({
        id: Date.now() + Math.random() * 1000, type: 'giris', partiNo, productName: name,
        amount: stock, unit: unit, date: todayStr(), note: 'İlk giriş', timestamp: new Date().toISOString()
      });
      // Yeni ürün başlangıç stoğunu ihaleye işle
      if (companyName && data.tenders && data.tenders.length) {
        const eslesen = data.tenders.filter(t =>
          t.companyName === companyName && t.product === name
        );
        eslesen.forEach(t => { t.delivered += stock; });
        if (eslesen.length) {
          saveData();
          toast(`✅ ${_fmt(stock)} ${unit} "${companyName}" ihaleye işlendi.`, 'success');
        }
      }
    }
    saveData();
    toast('Yeni ürün kartı oluşturuldu!', 'success');
  }

  // Yeni firma adını hafızaya ekle
  if (companyName && !data.companies.includes(companyName)) {
    data.companies.push(companyName);
    data.companies.sort((a, b) => a.localeCompare(b));
    saveData();
  }

  document.getElementById('new-product-modal').classList.remove('show');
  refreshWarehouse();
  refreshDashboard();
  buildMonthMenu();
  navigateTo('warehouse');
});

// Ürün sil
function deleteProduct(partiNo) {
  if (!confirm(`"${partiNo}" ürün kartı silinecek. Emin misiniz?`)) return;
  delete data.products[partiNo];
  saveData();
  toast('Ürün silindi.', 'info');
  refreshWarehouse();
  refreshDashboard();
  buildMonthMenu();
}

// ----- TEDARİKÇİ YÖNETİMİ -----
function refreshSuppliers() {
  const container = document.getElementById('supplier-list');
  if (!container) return;
  const list = data.companies || [];
  if (!list.length) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem 0;">Henüz tedarikçi eklenmemiş.</p>';
    return;
  }
  container.innerHTML = '<table class="minimal-table" style="width:100%;"><thead><tr><th style="text-align:left;">Tedarikçi Adı</th><th style="text-align:right;width:80px;">İşlem</th></tr></thead><tbody>' +
    list.map(c => `<tr>
      <td><strong>${c}</strong></td>
      <td style="text-align:right;">
        <button class="btn-ui btn-sm btn-outline" onclick="deleteSupplier('${c}')" title="Sil" style="color:var(--accent);"><i class="fa-solid fa-trash-can"></i></button>
      </td>
    </tr>`).join('') +
    '</tbody></table>';
}

function deleteSupplier(name) {
  if (!confirm(`"${name}" tedarikçisini silmek istediğinize emin misiniz?`)) return;
  data.companies = (data.companies || []).filter(c => c !== name);
  saveData();
  refreshSuppliers();
  refreshEntryForm();
  toast(`"${name}" silindi.`, 'success');
}

// Tedarikçi sayfası yönetimi (DOMContentLoaded'dan bağımsız çalışır)
(function setupSuppliers() {
  const addBtn = document.getElementById('add-supplier-btn');
  const input = document.getElementById('new-supplier-input');
  if (!addBtn || !input) return;
  const addSupplier = () => {
    const name = input.value.trim().toUpperCase();
    if (!name) { toast('Tedarikçi adı girin.', 'error'); return; }
    if ((data.companies || []).includes(name)) { toast('Bu tedarikçi zaten var!', 'error'); return; }
    data.companies = data.companies || [];
    data.companies.push(name);
    data.companies.sort((a, b) => a.localeCompare(b));
    saveData();
    input.value = '';
    refreshSuppliers();
    refreshEntryForm();
    toast(`"${name}" eklendi.`, 'success');
  };
  addBtn.addEventListener('click', addSupplier);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSupplier(); });
})();

// ----- GİRİŞ FORMU -----
function refreshEntryForm() {
  // Tedarikçi filtresini doldur
  const filter = document.getElementById('entry-supplier-filter');
  if (filter) {
    const seciliFirma = filter.value;
    filter.innerHTML = '<option value="">Tüm Tedarikçiler</option>' +
      (data.companies || []).map(c => `<option value="${c}"${c === seciliFirma ? ' selected' : ''}>${c}</option>`).join('');
  }
  // Ürün listesini filtrele
  const seciliFirma2 = filter ? filter.value : '';
  const select = document.getElementById('entry-product');
  let prods = Object.values(data.products).sort((a, b) => a.name.localeCompare(b.name));
  if (seciliFirma2) prods = prods.filter(p => p.companyName === seciliFirma2);
  select.innerHTML = prods.map(p =>
    `<option value="${p.partiNo}">[${p.partiNo}] ${p.name}${p.companyName ? ' — ' + p.companyName : ''} (Stok: ${_fmt(p.stock)} ${p.unit})</option>`
  ).join('');
  if (!prods.length) select.innerHTML = '<option value="">Önce ürün ekleyin</option>';
  document.getElementById('entry-date').value = todayStr();
  const secili = select.value;
  if (secili && data.products[secili] && data.products[secili].stt) {
    document.getElementById('entry-stt').value = data.products[secili].stt;
  } else {
    document.getElementById('entry-stt').value = '';
  }
}

document.getElementById('entry-product').addEventListener('change', () => {
  const partiNo = document.getElementById('entry-product').value;
  if (partiNo && data.products[partiNo] && data.products[partiNo].stt) {
    document.getElementById('entry-stt').value = data.products[partiNo].stt;
  } else {
    document.getElementById('entry-stt').value = '';
  }
});

// Tedarikçi filtresi değişince ürün listesini güncelle
const sf = document.getElementById('entry-supplier-filter');
if (sf) sf.addEventListener('change', refreshEntryForm);

function _parseAmount(v) {
  return parseFloat(v.replace(',', '.'));
}
function _fmt(n) {
  const s = n.toString();
  const i = s.indexOf('.');
  if (i === -1) return s;
  const dec = s.slice(i + 1, i + 3).replace(/0+$/, '');
  return dec ? s.slice(0, i) + '.' + dec : s.slice(0, i);
}

document.getElementById('entry-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const partiNo = document.getElementById('entry-product').value;
  const amount = _parseAmount(document.getElementById('entry-amount').value);
  const date = document.getElementById('entry-date').value;
  const note = document.getElementById('entry-note').value.trim();
  const stt = document.getElementById('entry-stt').value || '';

  if (!partiNo || !amount || amount <= 0 || !date) { toast('Tüm alanları doldurun.', 'error'); return; }
  const p = data.products[partiNo];
  if (!p) { toast('Ürün bulunamadı.', 'error'); return; }

  if (stt) p.stt = stt;
  p.stock += amount;
  data.transactions.push({
    id: Date.now() + Math.random() * 1000, type: 'giris', partiNo, productName: p.name,
    amount, unit: p.unit, date, note: note || 'Mal kabul', stt: stt || p.stt || '',
    timestamp: new Date().toISOString()
  });
  saveData();

  // İhale teslimatına otomatik ekle (ürünün firma adı ile eşleştir)
  let ihaleMsg = '';
  if (data.tenders && data.tenders.length && p.companyName) {
    const eslesen = data.tenders.filter(t =>
      t.companyName === p.companyName && t.product === p.name
    );
    eslesen.forEach(t => { t.delivered += amount; });
    if (eslesen.length) {
      saveData();
      ihaleMsg = ` | ✅ "${p.companyName}" ihaleye işlendi`;
    }
  }

  toast(`${_fmt(amount)} ${p.unit} ${p.name} girişi kaydedildi.${ihaleMsg}`, 'success');
  navigateTo('dashboard');
  refreshEntryForm();
  refreshDashboard();
  buildMonthMenu();
});

// Hizli urun ekle (entry formundaki + butonu)
document.getElementById('quick-add-btn').addEventListener('click', () => {
  document.getElementById('new-product-modal').classList.add('show');
});

// ----- ÇIKIŞ FORMU -----
function refreshExitForm() {
  const select = document.getElementById('exit-product');
  const prods = Object.values(data.products).sort((a, b) => a.name.localeCompare(b.name));
  select.innerHTML = prods.map(p =>
    `<option value="${p.partiNo}">[${p.partiNo}] ${p.name} (Stok: ${_fmt(p.stock)} ${p.unit})</option>`
  ).join('');
  if (!prods.length) select.innerHTML = '<option value="">Önce ürün ekleyin</option>';
  document.getElementById('exit-date').value = todayStr();
}

document.getElementById('exit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const partiNo = document.getElementById('exit-product').value;
  const amount = _parseAmount(document.getElementById('exit-amount').value);
  const date = document.getElementById('exit-date').value;
  const note = document.getElementById('exit-note').value.trim();

  if (!partiNo || !amount || amount <= 0 || !date) { toast('Tüm alanları doldurun.', 'error'); return; }
  const p = data.products[partiNo];
  if (!p) { toast('Ürün bulunamadı.', 'error'); return; }
  if (p.stock < amount) { toast(`Yetersiz stok! Mevcut: ${_fmt(p.stock)} ${p.unit}`, 'error'); return; }

  p.stock -= amount;
  data.transactions.push({
    id: Date.now() + Math.random() * 1000, type: 'cikis', partiNo, productName: p.name,
    amount, unit: p.unit, date, note: note || 'Ürün çıkış', timestamp: new Date().toISOString()
  });
  saveData();
  toast(`${_fmt(amount)} ${p.unit} ${p.name} çıkışı kaydedildi.`, 'success');
  navigateTo('dashboard');
  refreshExitForm();
  refreshDashboard();
  buildMonthMenu();
});

// ----- AYLIK RAPOR -----
function refreshMonthView() {
  const ay = window._selectedMonth !== undefined ? window._selectedMonth : AY_INDEX;
  const yil = window._selectedYear !== undefined ? window._selectedYear : new Date().getFullYear();
  document.getElementById('month-title').textContent = `${AYLAR[ay]} ${yil} — Aylık Rapor`;

  const girisler = data.transactions.filter(t => {
    const d = new Date(t.date);
    return t.type === 'giris' && d.getMonth() === ay && d.getFullYear() === yil;
  });
  const cikislar = data.transactions.filter(t => {
    const d = new Date(t.date);
    return t.type === 'cikis' && d.getMonth() === ay && d.getFullYear() === yil;
  });

  document.getElementById('month-in-total').textContent = `${_fmt(girisler.reduce((s, t) => s + t.amount, 0))} Adet`;
  document.getElementById('month-out-total').textContent = `${_fmt(cikislar.reduce((s, t) => s + t.amount, 0))} Adet`;

  function _birim(t) {
    return (data.products[t.partiNo] && data.products[t.partiNo].unit) || t.unit || '—';
  }

  const inBody = document.getElementById('month-in-list');
  inBody.innerHTML = girisler.length
    ? girisler.map(t => `<tr><td>${formatDate(t.date)}</td><td>${t.productName}</td><td>${t.amount}</td><td>${_birim(t)}</td></tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Bu ayda giriş yok.</td></tr>';

  const outBody = document.getElementById('month-out-list');
  outBody.innerHTML = cikislar.length
    ? cikislar.map(t => `<tr><td>${formatDate(t.date)}</td><td>${t.productName}</td><td>${t.amount}</td><td>${_birim(t)}</td></tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Bu ayda çıkış yok.</td></tr>';
}

// ----- YILLIK RAPOR -----
function refreshYearsView() {
  const prevYil = parseInt(document.getElementById('year-select').value);
  populateYearSelect('year-select', prevYil || new Date().getFullYear());
  populateYearProductFilter();
  const yil = parseInt(document.getElementById('year-select').value) || new Date().getFullYear();
  const urunFiltre = document.getElementById('year-product-filter').value;
  renderYearChart(yil);
  const hareketler = data.transactions.filter(t => {
    const ayniYil = new Date(t.date).getFullYear() === yil;
    return urunFiltre ? (ayniYil && t.productName === urunFiltre) : ayniYil;
  });

  const girisler = hareketler.filter(t => t.type === 'giris');
  const cikislar = hareketler.filter(t => t.type === 'cikis');

  document.getElementById('year-total-in').textContent = `${_fmt(girisler.reduce((s, t) => s + t.amount, 0))} Adet (${girisler.length} işlem)`;
  document.getElementById('year-total-out').textContent = `${_fmt(cikislar.reduce((s, t) => s + t.amount, 0))} Adet (${cikislar.length} işlem)`;

  const tbody = document.getElementById('year-report-body');
  if (!hareketler.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px;">Bu yıla ait hareket bulunamadı.</td></tr>';
    return;
  }

  hareketler.sort((a, b) => new Date(b.date) - new Date(a.date));
  tbody.innerHTML = hareketler.map(t => {
    const tipEl = t.type === 'giris'
      ? '<span style="color:var(--success);font-weight:700;">GİRİŞ</span>'
      : '<span style="color:var(--accent);font-weight:700;">ÇIKIŞ</span>';
    const birim = t.unit || (data.products[t.partiNo] && data.products[t.partiNo].unit) || '';
    return `<tr><td>${formatDate(t.date)}</td><td>${tipEl}</td><td>${t.productName}</td><td>${_fmt(t.amount)}</td><td>${birim}</td><td style="color:var(--text-secondary);">${t.note || '-'}</td></tr>`;
  }).join('');
}

document.getElementById('year-select').addEventListener('change', refreshYearsView);
document.getElementById('year-product-filter').addEventListener('change', refreshYearsView);

// ----- STT TAKIP -----
let _sttFilter = 'all';

function refreshSttTracking() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const products = Object.values(data.products).filter(p => p.stt).map(p => {
    const sttDate = new Date(p.stt + 'T00:00:00');
    const fark = Math.ceil((sttDate - now) / (1000 * 60 * 60 * 24));
    return { ...p, sttGunFark: fark };
  });

  let filtered = products;
  if (_sttFilter === 'expired') filtered = products.filter(p => p.sttGunFark < 0);
  else if (_sttFilter === 'approaching') filtered = products.filter(p => p.sttGunFark >= 0 && p.sttGunFark <= 30);
  else if (_sttFilter === 'ok') filtered = products.filter(p => p.sttGunFark > 30);
  else if (_sttFilter === 'bitti') filtered = products.filter(p => p.stock <= 0);

  filtered.sort((a, b) => a.sttGunFark - b.sttGunFark);

  document.getElementById('stt-filter-badge').textContent = filtered.length + ' ürün';

  const tbody = document.getElementById('stt-tracking-body');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px;">Bu filtrede STT\'li ürün bulunamadı.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const gecti = p.sttGunFark < 0;
    const uyari = gecti ? 'GEÇTİ' : (p.sttGunFark === 0 ? 'BUGÜN' : p.sttGunFark + ' gün');
    const renk = gecti ? 'var(--accent)' : (p.sttGunFark <= 7 ? 'var(--warning)' : 'var(--success)');
    const stokBitti = p.stock <= 0;
    const not = stokBitti ? '<span style="color:var(--accent);font-weight:700;">STOKTA BİTTİ</span>' : '—';
    return `<tr>
      <td style="font-weight:600;color:var(--primary);">${p.partiNo}</td>
      <td><strong>${p.name}</strong></td>
      <td>${formatDate(p.stt)}</td>
      <td style="color:${renk};font-weight:700;">${uyari}</td>
      <td>${_fmt(p.stock)} ${p.unit}</td>
      <td>${not}</td>
    </tr>`;
  }).join('');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.stt-filter-btn');
  if (!btn) return;
  document.querySelectorAll('.stt-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _sttFilter = btn.dataset.filter;
  refreshSttTracking();
});

// ----- IHALE TAKIP -----
function refreshTenders() {
  if (!data.tenders) data.tenders = [];
  const tbody = document.getElementById('tender-body');
  if (!data.tenders.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:40px;">Henüz ihale kaydı yok.</td></tr>';
    return;
  }
  tbody.innerHTML = data.tenders.map(t => {
    const kalan = t.quantity - t.delivered;
    const sozlesmeTutar = t.price * t.quantity;
    const teslimTutar = t.price * t.delivered;
    const oran = sozlesmeTutar > 0 ? ((teslimTutar / sozlesmeTutar) * 100).toFixed(1) : 0;
    const oranRenk = oran >= 100 ? 'var(--success)' : (oran >= 50 ? 'var(--warning)' : 'var(--accent)');
    return `<tr>
      <td style="white-space:nowrap;"><strong>${t.companyName}</strong></td>
      <td style="white-space:nowrap;">${t.product}</td>
      <td style="text-align:right;white-space:nowrap;">${_fmt(t.quantity)}</td>
      <td style="text-align:right;white-space:nowrap;">${_fmt(t.delivered)}</td>
      <td style="text-align:right;white-space:nowrap;">${_fmt(kalan)}</td>
      <td style="text-align:right;white-space:nowrap;">${_fmt(t.price)} ₺</td>
      <td style="text-align:right;white-space:nowrap;">${_fmt(sozlesmeTutar)} ₺</td>
      <td style="text-align:right;white-space:nowrap;">${_fmt(teslimTutar)} ₺</td>
      <td style="text-align:right;white-space:nowrap;color:${oranRenk};font-weight:700;">%${oran}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-ui btn-sm btn-outline" onclick="editTender(${t.id})" title="Düzenle"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-ui btn-sm btn-outline" onclick="deleteTender(${t.id})" title="Sil" style="color:var(--accent);"><i class="fa-solid fa-trash-can"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function openTenderModal(editId) {
  const modal = document.getElementById('tender-modal');
  const form = document.getElementById('tender-form');
  form.reset();
  document.getElementById('tender-edit-id').value = '';
  document.getElementById('tender-modal-title').textContent = 'Yeni İhale';
  document.getElementById('tender-submit-text').textContent = 'İhale Ekle';
  if (editId) {
    const t = data.tenders.find(x => x.id === editId);
    if (!t) return;
    document.getElementById('tender-edit-id').value = t.id;
    document.getElementById('tender-company').value = t.companyName;
    document.getElementById('tender-product').value = t.product;
    document.getElementById('tender-quantity').value = t.quantity;
    document.getElementById('tender-delivered').value = t.delivered;
    document.getElementById('tender-price').value = t.price;
    document.getElementById('tender-modal-title').textContent = 'İhale Düzenle';
    document.getElementById('tender-submit-text').textContent = 'Güncelle';
  }
  modal.classList.add('show');
}
function editTender(id) { openTenderModal(id); }

function deleteTender(id) {
  if (!confirm('Bu ihaleyi silmek istediğinize emin misiniz?')) return;
  data.tenders = data.tenders.filter(t => t.id !== id);
  saveData();
  refreshTenders();
  toast('İhale silindi.', 'success');
}

document.getElementById('add-tender-btn').addEventListener('click', () => openTenderModal());

document.getElementById('tender-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const editId = document.getElementById('tender-edit-id').value;
  const companyName = document.getElementById('tender-company').value.trim();
  const product = document.getElementById('tender-product').value.trim();
  const quantity = _parseAmount(document.getElementById('tender-quantity').value);
  const delivered = _parseAmount(document.getElementById('tender-delivered').value) || 0;
  const price = _parseAmount(document.getElementById('tender-price').value);

  if (!companyName || !product || !quantity || !price) { toast('Tüm alanları doldurun.', 'error'); return; }

  if (editId) {
    const t = data.tenders.find(x => x.id === parseFloat(editId));
    if (t) { t.companyName = companyName; t.product = product; t.quantity = quantity; t.delivered = delivered; t.price = price; }
    toast('İhale güncellendi.', 'success');
  } else {
    data.tenders.push({ id: Date.now() + Math.random() * 1000, companyName, product, quantity, delivered, price });
    toast('İhale eklendi.', 'success');
  }
  saveData();
  document.getElementById('tender-modal').classList.remove('show');
  refreshTenders();
});

// ----- AYARLAR -----
function refreshSettings() {
  // Kullanici adi
  document.getElementById('settings-username').value = data.activeUser || '';
  const aktifKullanici = data.users.find(u => u.name === data.activeUser);
  document.getElementById('settings-role').value = aktifKullanici ? aktifKullanici.role : '';

  // Kullanici listesi
  const ul = document.getElementById('users-list-ul');
  ul.innerHTML = data.users.map(u => {
    const aktif = u.name === data.activeUser;
    return `<li style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-primary);padding:10px 14px;border-radius:var(--border-radius-sm);border:1px solid ${aktif ? 'var(--primary)' : 'var(--border-color)'};">
      <span><strong>${u.name}</strong> <span style="color:var(--text-secondary);font-size:13px;">— ${u.role}</span> ${aktif ? '<span style="background:var(--primary-light);color:var(--primary);padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;margin-left:6px;">AKTİF</span>' : ''}</span>
      <button class="btn-ui btn-sm btn-outline" onclick="deleteUser('${u.name}')" style="color:var(--accent);"><i class="fa-solid fa-xmark"></i></button>
    </li>`;
  }).join('');

  // GitHub Ayarları
  const gh = data.settings.github || {};
  document.getElementById('github-owner').value = gh.owner || HARD_CODED_GITHUB.owner || '';
  document.getElementById('github-repo').value = gh.repo || HARD_CODED_GITHUB.repo || '';
  document.getElementById('github-path').value = gh.path || HARD_CODED_GITHUB.path || '';
  document.getElementById('github-token').value = gh.token || '';

  // Otomatik senkron
  document.getElementById('auto-sync-toggle').checked = data.settings.autoSync !== false;

  // Cloud status badge
  const badge = document.getElementById('cloud-status-badge');
  if (githubApiUrl()) {
    badge.style.borderColor = 'var(--success)';
    badge.style.color = 'var(--success)';
  } else {
    badge.style.borderColor = '';
    badge.style.color = '';
  }

  // Yedekleme
  document.getElementById('auto-backup-time').value = data.settings.autoBackupTime || '17:00';
  document.getElementById('auto-backup-toggle').checked = data.settings.autoBackupEnabled || false;
}

// Profil formu (unvan kaydet)
document.getElementById('profile-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const role = document.getElementById('settings-role').value.trim();
  if (data.activeUser) {
    const u = data.users.find(x => x.name === data.activeUser);
    if (u) { u.role = role; saveData(); toast('Unvan güncellendi.', 'success'); refreshSettings(); }
  }
});

// Kullanici ekle
document.getElementById('add-user-btn').addEventListener('click', () => {
  const name = document.getElementById('new-username-input').value.trim();
  if (!name) { toast('Kullanıcı adı girin.', 'error'); return; }
  if (data.users.find(u => u.name === name)) { toast('Bu kullanıcı zaten var.', 'error'); return; }
  data.users.push({ name, role: 'Depo Personeli' });
  saveData();
  toast(`"${name}" eklendi.`, 'success');
  document.getElementById('new-username-input').value = '';
  refreshSettings();
  refreshUserSelect();
});

function deleteUser(name) {
  if (data.users.length <= 1) { toast('En az bir kullanıcı kalmalı.', 'error'); return; }
  if (name === data.activeUser) { toast('Aktif kullanıcıyı silemezsiniz. Önce başka bir kullanıcı seçin.', 'error'); return; }
  if (!confirm(`"${name}" kullanıcısını sil?`)) return;
  data.users = data.users.filter(u => u.name !== name);
  saveData();
  toast('Kullanıcı silindi.', 'info');
  refreshSettings();
  refreshUserSelect();
}

// Kullanici secici
function refreshUserSelect() {
  const select = document.getElementById('active-user-select');
  select.innerHTML = data.users.map(u =>
    `<option value="${u.name}" ${u.name === data.activeUser ? 'selected' : ''}>${u.name}</option>`
  ).join('');
}

document.getElementById('active-user-select').addEventListener('change', (e) => {
  data.activeUser = e.target.value;
  saveData();
  document.getElementById('display-username').textContent = data.activeUser;
  const u = data.users.find(x => x.name === data.activeUser);
  document.getElementById('display-role').textContent = u ? u.role : '';
  refreshSettings();
  toast(`Aktif kullanıcı: ${data.activeUser}`, 'info');
});

// ----- GITHUB AYARLARI -----
document.getElementById('save-api-btn').addEventListener('click', () => {
  const owner = document.getElementById('github-owner').value.trim();
  const repo = document.getElementById('github-repo').value.trim();
  const path = document.getElementById('github-path').value.trim();
  const token = document.getElementById('github-token').value.trim();

  if (!data.settings.github) data.settings.github = {};
  data.settings.github.owner = owner;
  data.settings.github.repo = repo;
  data.settings.github.path = path;
  data.settings.github.token = token;
  saveDataLocal();

  const status = document.getElementById('connection-status');
  if (owner && repo && token) {
    status.innerHTML = '<span style="color:var(--success);">✅ GitHub bilgileri kaydedildi. "Test Et" ile bağlantıyı doğrulayın.</span>';
  } else {
    status.innerHTML = '<span style="color:var(--text-secondary);">ℹ️ GitHub bilgileri temizlendi.</span>';
  }
  toast('GitHub ayarları kaydedildi.', 'success');
  refreshSettings();
});

document.getElementById('test-connection-btn').addEventListener('click', githubTest);

document.getElementById('sync-now-btn').addEventListener('click', async () => {
  if (!githubApiUrl()) { toast('GitHub bilgileri eksik. Ayarları doldurun.', 'error'); return; }

  const overlay = document.getElementById('loading-overlay');
  overlay.style.display = 'flex';
  document.getElementById('loading-text').textContent = 'GitHub\'a kaydediliyor...';

  try {
    await githubSave(data);
    toast('✅ Tüm veriler GitHub\'a kaydedildi!', 'success');
  } catch (err) {
    toast('GitHub kayıt hatası: ' + err.message, 'error');
  } finally {
    overlay.style.display = 'none';
    refreshSettings();
  }
});

// ----- YEDEKLEME -----
document.getElementById('backup-btn').addEventListener('click', () => {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tazedepo_yedek_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Veri tabanı JSON olarak indirildi.', 'success');
});

document.getElementById('restore-btn').addEventListener('click', () => {
  const fileInput = document.getElementById('restore-file');
  const file = fileInput.files[0];
  if (!file) { toast('Önce bir .json dosyası seçin.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.products || !imported.transactions) {
        toast('Geçersiz yedek dosyası!', 'error'); return;
      }
      if (!confirm('Mevcut tüm veri değişecek. Devam et?')) return;
      data = imported;
      initData();
      saveData();
      toast('Veri başarıyla geri yüklendi!', 'success');
      fileInput.value = '';
      refreshAll();
    } catch (err) {
      toast('Dosya okunamadı: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
});

// Otomatik yedekleme
document.getElementById('auto-backup-toggle').addEventListener('change', (e) => {
  data.settings.autoBackupEnabled = e.target.checked;
  saveData();
  if (e.target.checked) {
    toast('Otomatik yedekleme aktif.', 'success');
    scheduleAutoBackup();
  } else {
    toast('Otomatik yedekleme devre dışı.', 'info');
  }
});

document.getElementById('auto-backup-time').addEventListener('change', (e) => {
  data.settings.autoBackupTime = e.target.value;
  saveData();
  if (data.settings.autoBackupEnabled) scheduleAutoBackup();
});

let backupTimer = null;
function scheduleAutoBackup() {
  if (backupTimer) {
    clearTimeout(backupTimer);
    backupTimer = null;
  }
  if (!data.settings.autoBackupEnabled) return;

  const [h, m] = (data.settings.autoBackupTime || '17:00').split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);

  if (target <= now) target.setDate(target.getDate() + 1);

  backupTimer = setTimeout(() => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tazedepo_otomatik_${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    document.getElementById('backup-status-msg').textContent = `✅ ${new Date().toLocaleTimeString('tr-TR')} — Otomatik yedek indirildi.`;
    toast('Otomatik yedek alındı.', 'success');
    scheduleAutoBackup();
  }, target.getTime() - now.getTime());
}

// ----- NAVIGASYON EVENTLERI -----
document.querySelectorAll('.nav-item[data-target]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const target = item.dataset.target;
    if (target === 'month-view') {
      window._selectedMonth = AY_INDEX;
      window._selectedYear = new Date().getFullYear();
      document.querySelectorAll('.nav-item[data-month]').forEach(n => n.classList.remove('active'));
      const el = document.querySelector(`.nav-item[data-month="${AY_INDEX}"]`);
      if (el) el.classList.add('active');
    }
    navigateTo(target);
  });
});

// ----- TUMUNU YENILE -----
function refreshAll() {
  refreshUserSelect();
  buildMonthMenu();
  refreshPersonFilter();
  refreshDashboard();
  refreshWarehouse();
  refreshEntryForm();
  refreshExitForm();
  refreshSettings();

  // Aktif view'i güncelle
  const aktifView = document.querySelector('.view-section.active');
  if (aktifView) {
    const id = aktifView.id;
    if (id === 'dashboard') refreshDashboard();
    if (id === 'warehouse') refreshWarehouse();
    if (id === 'month-view') refreshMonthView();
    if (id === 'years-view') refreshYearsView();
    if (id === 'daily') refreshDailyView();
  }
}

// ----- SAAT -----
function updateClock() {
  document.getElementById('header-date').textContent = new Date().toLocaleString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// ----- GÜNLÜK İŞLEMLER -----
function refreshDailyView() {
  const prevYil = parseInt(document.getElementById('daily-year-select').value);
  populateYearSelect('daily-year-select', prevYil || new Date().getFullYear());
  const dateStr = document.getElementById('daily-date').value || todayStr();
  document.getElementById('daily-date').value = dateStr;
  const yil = parseInt(document.getElementById('daily-year-select').value) || new Date().getFullYear();

  // Yıla göre filtrele, tarih seçiliyse ona da daralt
  let yilHareket = data.transactions.filter(t => new Date(t.date).getFullYear() === yil);
  let hareketler = dateStr ? yilHareket.filter(t => t.date === dateStr) : yilHareket;

  // Kişi filtresi
  const kisiFiltre = document.getElementById('daily-person-filter').value;
  if (kisiFiltre) {
    hareketler = hareketler.filter(t => extractPerson(t.note) === kisiFiltre);
  }

  const giris = hareketler.filter(t => t.type === 'giris');
  const cikis = hareketler.filter(t => t.type === 'cikis');
  document.getElementById('daily-giris-adet').textContent = _fmt(giris.reduce((s,t) => s + t.amount, 0)) + ' (' + giris.length + ' işlem)';
  document.getElementById('daily-cikis-adet').textContent = _fmt(cikis.reduce((s,t) => s + t.amount, 0)) + ' (' + cikis.length + ' işlem)';
  document.getElementById('daily-toplam-adet').textContent = _fmt(hareketler.reduce((s,t) => s + t.amount, 0)) + ' (' + hareketler.length + ' işlem)';

  document.getElementById('daily-baslik').textContent = yil + ' Yılı' + (dateStr ? ' — ' + formatDate(dateStr) : ' — Tümü');

  const tbody = document.getElementById('daily-body');
  if (!hareketler.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px;">Bu tarihte işlem bulunamadı.</td></tr>';
    return;
  }
  hareketler.sort((a,b) => (b.id || 0) - (a.id || 0));
  tbody.innerHTML = hareketler.map((t,i) => {
    const tip = t.type === 'giris'
      ? '<span style="color:var(--success);font-weight:700;">GİRİŞ</span>'
      : '<span style="color:var(--accent);font-weight:700;">ÇIKIŞ</span>';
    const birim = t.unit || (data.products[t.partiNo] && data.products[t.partiNo].unit) || '';
    return `<tr><td>${i+1}</td><td>${tip}</td><td style="font-weight:600;">${t.partiNo}</td><td>${t.productName}</td><td>${_fmt(t.amount)}</td><td>${birim}</td><td style="color:var(--text-secondary);">${t.note || '-'}</td></tr>`;
  }).join('');
}

function pdfCikti() {
  const dateStr = document.getElementById('daily-date').value || todayStr();
  const baslik = document.getElementById('daily-baslik').textContent;
  const tablo = document.querySelector('#daily .minimal-table');
  const istatistik = document.querySelector('#daily .stats-grid');

  // print dostu stil
  const printStyle = document.createElement('style');
  printStyle.id = 'pdf-style';
  printStyle.textContent = `
    @media print {
      body * { visibility: hidden; }
      #daily, #daily * { visibility: visible; }
      #daily { position: absolute; left: 0; top: 0; width: 100%; }
      .stats-grid { display: grid !important; grid-template-columns: repeat(3,1fr) !important; gap: 16px !important; margin-bottom: 20px !important; }
      .stat-card { border: 1px solid #ccc !important; padding: 12px !important; border-radius: 8px !important; }
      .minimal-table { width: 100% !important; border-collapse: collapse !important; }
      .minimal-table th { background: #f1f5f9 !important; color: #000 !important; padding: 10px !important; border: 1px solid #ccc !important; }
      .minimal-table td { padding: 8px 10px !important; border: 1px solid #ddd !important; color: #000 !important; }
      .btn-ui, .theme-btn, .nav-menu, .sidebar, .top-bar, .info-cards { display: none !important; }
      .panel-container { box-shadow: none !important; border: 1px solid #ccc !important; }
      #daily-pdf-container { border: 1px solid #ccc !important; }
      h3 { font-size: 18px !important; margin-bottom: 12px !important; }
    }
    @page { margin: 15mm; }
  `;
  document.head.appendChild(printStyle);
  window.print();
  setTimeout(() => { document.getElementById('pdf-style').remove(); }, 500);
}

// ----- EVENT LISTENER'LAR (DOMContentLoaded öncesi tanımlar) -----
document.addEventListener('DOMContentLoaded', () => {
  // + Yeni Ürün butonu
  document.getElementById('add-product-btn').addEventListener('click', () => openProductModal());

  // Günlük İşlemler tarih / yıl değişikliği
  document.getElementById('daily-date').addEventListener('change', refreshDailyView);
  document.getElementById('daily-year-select').addEventListener('change', refreshDailyView);

  // Ay menüsü yıl değişikliği
  document.getElementById('months-year-select').addEventListener('change', buildMonthMenu);

  // Kişi filtresi değişikliği
  const personSelect = document.getElementById('daily-person-filter');
  if (personSelect) {
    personSelect.addEventListener('change', refreshDailyView);
  }

  // Otomatik senkron aç/kapa
  document.getElementById('auto-sync-toggle').addEventListener('change', (e) => {
    data.settings.autoSync = e.target.checked;
    saveDataLocal();
  });

  // Önce veriyi yükle (Drive'dan çek), bitince arayüzü çiz
  loadData().then(() => {
    if (!data.settings._migrated) {
      data.settings.theme = 'light';
      data.settings._migrated = true;
      saveData();
    }
    applyTheme(data.settings.theme || 'light');
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    refreshAll();
    updateClock();
    setInterval(updateClock, 10000);
    if (data.settings.autoBackupEnabled) scheduleAutoBackup();
  });

  // Mobil menü toggle
  const menuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('show');
    });
    if (overlay) overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
    // Tabloları kaydırılabilir yap
    document.querySelectorAll('.minimal-table').forEach(t => {
      if (!t.parentElement.classList.contains('table-wrap')) {
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        t.parentNode.insertBefore(wrap, t);
        wrap.appendChild(t);
      }
    });

    // Sidebar link tıklanınca kapat
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 480) {
          sidebar.classList.remove('open');
          if (overlay) overlay.classList.remove('show');
        }
      });
    });
  }
});
