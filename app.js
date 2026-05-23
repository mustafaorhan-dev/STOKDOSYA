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

function todayStr() { return new Date().toISOString().split('T')[0]; }

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
const AY_INDEX = new Date().getMonth(); // 0-based

// ----- TOAST -----
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
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
    'years-view': 'Yıllık Raporlar', 'settings-view': 'Ayarlar & Bulut'
  };
  document.getElementById('page-title').textContent = titles[target] || 'STOKDOSYA';

  // view'e ozel yenilemeler
  if (target === 'dashboard') refreshDashboard();
  if (target === 'warehouse') refreshWarehouse();
  if (target === 'month-view') refreshMonthView();
  if (target === 'years-view') refreshYearsView();
  if (target === 'entry') refreshEntryForm();
  if (target === 'exit') refreshExitForm();
  if (target === 'daily') refreshDailyView();
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
  document.getElementById('total-stock').textContent = prods.reduce((s, p) => s + p.stock, 0);

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
      return `<tr><td style="font-weight:600;">${t.partiNo}</td><td>${formatDate(t.date)}</td><td>${tipEl}</td><td>${t.productName}</td><td>${t.amount}</td><td>${birim}</td><td style="color:var(--text-secondary);">${t.note || '-'}</td></tr>`;
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
        <div style="flex:1;"><strong>${p.name}</strong><br><span style="font-size:13px;color:var(--text-secondary);">Stok: ${p.stock} / Limit: ${p.criticalLevel} ${p.unit}</span></div>
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
        <div style="flex:1;"><strong>${p.name}</strong> [${p.partiNo}]<br><span style="font-size:13px;color:var(--text-secondary);">STT: ${formatDate(p.stt)} — Stok: ${p.stock} ${p.unit}</span></div>
        <span style="background:${bg};color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;">${uyari}</span>
      </div>`;
    }).join('');
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
      <td style="${stokClass}">${p.stock} ${p.unit}</td>
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
    document.getElementById('np-stock').value = p.stock;
    document.getElementById('np-critical').value = p.criticalLevel;
    document.getElementById('np-stt').value = p.stt || '';
    document.getElementById('submit-product-btn').innerHTML = '<i class="fa-solid fa-pen"></i> Kartı Güncelle';
  } else {
    document.getElementById('np-id').readOnly = false;
    document.getElementById('np-id').value = '';
    document.getElementById('np-stt').value = '';
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
  const stock = parseInt(document.getElementById('np-stock').value) || 0;
  const critical = parseInt(document.getElementById('np-critical').value) || 0;
  const stt = document.getElementById('np-stt').value || '';

  if (!partiNo || !name) { toast('Parti No ve ürün adı gerekli!', 'error'); return; }

  if (isEdit) {
    const p = data.products[partiNo];
    if (p) {
      p.name = name; p.category = category; p.unit = unit;
      p.stock = stock; p.criticalLevel = critical; p.stt = stt;
      saveData();
      toast('Ürün güncellendi.', 'success');
    }
  } else {
    if (data.products[partiNo]) { toast('Bu Parti No zaten var!', 'error'); return; }
    data.products[partiNo] = {
      partiNo, name, category, unit, stock, criticalLevel: critical, stt: stt,
      createdAt: new Date().toISOString()
    };
    if (stock > 0) {
      data.transactions.push({
        id: Date.now() + Math.random() * 1000, type: 'giris', partiNo, productName: name,
        amount: stock, unit: unit, date: todayStr(), note: 'İlk giriş', timestamp: new Date().toISOString()
      });
    }
    saveData();
    toast('Yeni ürün kartı oluşturuldu!', 'success');
  }

  document.getElementById('new-product-modal').classList.remove('show');
  refreshWarehouse();
  refreshDashboard();
  buildMonthMenu();
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

// ----- GİRİŞ FORMU -----
function refreshEntryForm() {
  const select = document.getElementById('entry-product');
  const prods = Object.values(data.products).sort((a, b) => a.name.localeCompare(b.name));
  select.innerHTML = prods.map(p =>
    `<option value="${p.partiNo}">[${p.partiNo}] ${p.name} (Stok: ${p.stock} ${p.unit})</option>`
  ).join('');
  if (!prods.length) select.innerHTML = '<option value="">Önce ürün ekleyin</option>';
  document.getElementById('entry-date').value = todayStr();
  // Seçili ürün varsa STT'sini göster
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

document.getElementById('entry-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const partiNo = document.getElementById('entry-product').value;
  const amount = parseInt(document.getElementById('entry-amount').value);
  const date = document.getElementById('entry-date').value;
  const note = document.getElementById('entry-note').value.trim();
  const stt = document.getElementById('entry-stt').value || '';

  if (!partiNo || !amount || !date) { toast('Tüm alanları doldurun.', 'error'); return; }
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
  toast(`${amount} ${p.unit} ${p.name} girişi kaydedildi.`, 'success');
  document.getElementById('entry-amount').value = '';
  document.getElementById('entry-note').value = '';
  document.getElementById('entry-stt').value = '';
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
    `<option value="${p.partiNo}">[${p.partiNo}] ${p.name} (Stok: ${p.stock} ${p.unit})</option>`
  ).join('');
  if (!prods.length) select.innerHTML = '<option value="">Önce ürün ekleyin</option>';
  document.getElementById('exit-date').value = todayStr();
}

document.getElementById('exit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const partiNo = document.getElementById('exit-product').value;
  const amount = parseInt(document.getElementById('exit-amount').value);
  const date = document.getElementById('exit-date').value;
  const note = document.getElementById('exit-note').value.trim();

  if (!partiNo || !amount || !date) { toast('Tüm alanları doldurun.', 'error'); return; }
  const p = data.products[partiNo];
  if (!p) { toast('Ürün bulunamadı.', 'error'); return; }
  if (p.stock < amount) { toast(`Yetersiz stok! Mevcut: ${p.stock} ${p.unit}`, 'error'); return; }

  p.stock -= amount;
  data.transactions.push({
    id: Date.now() + Math.random() * 1000, type: 'cikis', partiNo, productName: p.name,
    amount, unit: p.unit, date, note: note || 'Ürün çıkış', timestamp: new Date().toISOString()
  });
  saveData();
  toast(`${amount} ${p.unit} ${p.name} çıkışı kaydedildi.`, 'success');
  document.getElementById('exit-amount').value = '';
  document.getElementById('exit-note').value = '';
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

  document.getElementById('month-in-total').textContent = girisler.reduce((s, t) => s + t.amount, 0);
  document.getElementById('month-out-total').textContent = cikislar.reduce((s, t) => s + t.amount, 0);

  const inBody = document.getElementById('month-in-list');
  inBody.innerHTML = girisler.length
    ? girisler.map(t => `<tr><td>${formatDate(t.date)}</td><td>${t.productName}</td><td>${t.amount}</td></tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:20px;">Bu ayda giriş yok.</td></tr>';

  const outBody = document.getElementById('month-out-list');
  outBody.innerHTML = cikislar.length
    ? cikislar.map(t => `<tr><td>${formatDate(t.date)}</td><td>${t.productName}</td><td>${t.amount}</td></tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:20px;">Bu ayda çıkış yok.</td></tr>';
}

// ----- YILLIK RAPOR -----
function refreshYearsView() {
  const prevYil = parseInt(document.getElementById('year-select').value);
  populateYearSelect('year-select', prevYil || new Date().getFullYear());
  const yil = parseInt(document.getElementById('year-select').value) || new Date().getFullYear();
  const hareketler = data.transactions.filter(t => new Date(t.date).getFullYear() === yil);

  const girisler = hareketler.filter(t => t.type === 'giris');
  const cikislar = hareketler.filter(t => t.type === 'cikis');

  document.getElementById('year-total-in').textContent = `${girisler.reduce((s, t) => s + t.amount, 0)} Adet (${girisler.length} işlem)`;
  document.getElementById('year-total-out').textContent = `${cikislar.reduce((s, t) => s + t.amount, 0)} Adet (${cikislar.length} işlem)`;

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
    return `<tr><td>${formatDate(t.date)}</td><td>${tipEl}</td><td>${t.productName}</td><td>${t.amount}</td><td>${birim}</td><td style="color:var(--text-secondary);">${t.note || '-'}</td></tr>`;
  }).join('');
}

document.getElementById('year-select').addEventListener('change', refreshYearsView);

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
  refreshDashboard();
  refreshWarehouse();
  refreshEntryForm();
  refreshExitForm();
  refreshSettings();

  // Günlük İşlemler tarihini bugüne ayarla
  document.getElementById('daily-date').value = todayStr();

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

  const giris = hareketler.filter(t => t.type === 'giris');
  const cikis = hareketler.filter(t => t.type === 'cikis');
  document.getElementById('daily-giris-adet').textContent = giris.reduce((s,t) => s + t.amount, 0) + ' (' + giris.length + ' işlem)';
  document.getElementById('daily-cikis-adet').textContent = cikis.reduce((s,t) => s + t.amount, 0) + ' (' + cikis.length + ' işlem)';
  document.getElementById('daily-toplam-adet').textContent = hareketler.reduce((s,t) => s + t.amount, 0) + ' (' + hareketler.length + ' işlem)';

  document.getElementById('daily-baslik').textContent = yil + ' Yılı' + (dateStr ? ' — ' + dateStr : ' — Tümü');

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
    return `<tr><td>${i+1}</td><td>${tip}</td><td style="font-weight:600;">${t.partiNo}</td><td>${t.productName}</td><td>${t.amount}</td><td>${birim}</td><td style="color:var(--text-secondary);">${t.note || '-'}</td></tr>`;
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
});
