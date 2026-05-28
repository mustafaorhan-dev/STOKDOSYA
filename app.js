const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwLmUtNa7AcFMJXuocJ_jxP9izViiH6IpF3xEE2IoliHAyRHelKwOFXV-zrTa8m-tMYcQ/exec';
const DATA_KEY = 'tazedepo_data';

let data = {
  Anbar_Listesi: [], Mal_Kabul: [], Urun_Cikis: [],
  Gunluk_Islemler: [], Yillik_Raporlar: [],
  STT_Takip: [], Ihale_Takip: [], Tedarikciler: [],
  Suruculer: [],
  Kullanicilar: [], Ayarlar: [],
  activeUser: ''
};
let productMap = new Map();
let partiSeq = 1;
let _syncLock = false;

const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const AY_INDEX = new Date().getMonth();

function buildProductMap() {
  productMap.clear();
  data.Anbar_Listesi.forEach(p => {
    productMap.set(p.PartiNo, p);
  });
}

function dataToCache() {
  return { ...data };
}

function dataFromCache(cached) {
  data.Anbar_Listesi = cached.Anbar_Listesi || [];
  data.Mal_Kabul = cached.Mal_Kabul || [];
  data.Urun_Cikis = cached.Urun_Cikis || [];
  data.Gunluk_Islemler = cached.Gunluk_Islemler || [];
  data.STT_Takip = cached.STT_Takip || [];
  data.Ihale_Takip = cached.Ihale_Takip || [];
  data.Tedarikciler = cached.Tedarikciler || [];
  data.Suruculer = cached.Suruculer || [];
  data.Kullanicilar = cached.Kullanicilar || [];
  data.Ayarlar = cached.Ayarlar || [];
  data.activeUser = cached.activeUser || '';
  buildProductMap();
}

function saveLocalCache() {
  localStorage.setItem(DATA_KEY, JSON.stringify(dataToCache()));
}

function loadLocalCache() {
  const raw = localStorage.getItem(DATA_KEY);
  if (raw) {
    try { dataFromCache(JSON.parse(raw)); return true; } catch(e) {}
  }
  return false;
}

function loadData() {
  return fetch(GOOGLE_SCRIPT_URL, { method: 'GET' })
    .then(r => r.json())
    .then(json => {
      if (json && typeof json === 'object') {
        dataFromCache(json);
        saveLocalCache();
        applySettings();
      }
    })
    .catch(() => {
      const ok = loadLocalCache();
      if (!ok) {
        data.Kullanicilar = [
          { Ad: 'Depo Şefi', Rol: 'Yönetici', Email: '', Sifre: '' },
          { Ad: 'Yardımcı Şef Ali', Rol: 'Depo Sorumlusu', Email: '', Sifre: '' }
        ];
        data.activeUser = 'Depo Şefi';
        data.Ayarlar = [{ Anahtar: 'tema', Deger: 'dark' }];
      }
      buildProductMap();
    });
}

function getAyarlar() {
  const s = {};
  data.Ayarlar.forEach(a => s[a.Anahtar] = a.Deger);
  return s;
}

function applySettings() {
  const s = getAyarlar();
  const tema = s.tema || 'dark';
  document.documentElement.setAttribute('data-theme', tema);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = tema === 'light' ? '☀️' : '🌙';
}

function saveRow(targetSheet, rowData) {
  if (_syncLock) return Promise.reject(new Error('Sync in progress'));
  _syncLock = true;
  document.getElementById('loading-overlay').style.display = 'flex';
  return fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({ targetSheet, rowData: Array.isArray(rowData) ? rowData : [rowData] })
  })
  .then(r => r.text())
  .then(() => {
    document.getElementById('cloud-status-text').textContent = '✅ Kaydedildi';
    saveLocalCache();
  })
  .catch(e => {
    document.getElementById('cloud-status-text').textContent = '⚠️ Hata: ' + e.message;
    throw e;
  })
  .finally(() => {
    _syncLock = false;
    document.getElementById('loading-overlay').style.display = 'none';
  });
}

function addOrUpdateProduct(product) {
  const idx = data.Anbar_Listesi.findIndex(p => p.PartiNo === product.PartiNo);
  if (idx >= 0) {
    data.Anbar_Listesi[idx] = { ...data.Anbar_Listesi[idx], ...product };
  } else {
    data.Anbar_Listesi.push(product);
  }
  productMap.set(product.PartiNo, data.Anbar_Listesi[idx >= 0 ? idx : data.Anbar_Listesi.length - 1]);
  saveLocalCache();
}

function getProduct(partiNo) {
  return productMap.get(partiNo);
}

function toast(msg, type) {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '0.3s'; setTimeout(() => el.remove(), 300); }, 3000);
}

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

function isValidDate(str) {
  if (!str) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (y < 2016 || y > 2040) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  return true;
}

function _fmt(v) { return Number(v).toLocaleString('tr-TR'); }

function getUsers() {
  return data.Kullanicilar || [];
}

function getActiveUser() {
  return data.activeUser || 'Depo Şefi';
}

function getSettings() {
  return getAyarlar();
}

function temaSuan() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function toggleTheme() {
  const s = getAyarlar();
  const current = s.tema || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  const idx = data.Ayarlar.findIndex(a => a.Anahtar === 'tema');
  if (idx >= 0) data.Ayarlar[idx].Deger = next;
  else data.Ayarlar.push({ Anahtar: 'tema', Deger: next });
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('theme-toggle').textContent = next === 'light' ? '☀️' : '🌙';
  saveLocalCache();
  saveRow('Ayarlar', { Anahtar: 'tema', Deger: next }).catch(() => {});
}

function refreshUserSelect() {
  const select = document.getElementById('active-user-select');
  if (!select) return;
  select.innerHTML = getUsers().map(u =>
    `<option value="${u.Ad}" ${u.Ad === getActiveUser() ? 'selected' : ''}>${u.Ad}</option>`
  ).join('');
}

function populateYearSelect(id, selected) {
  const el = document.getElementById(id);
  if (!el) return;
  const y = selected || new Date().getFullYear();
  el.innerHTML = '';
  for (let i = 2026; i <= 2032; i++) {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = i;
    if (i === y) opt.selected = true;
    el.appendChild(opt);
  }
}

function populateProductSelect(id, selectedVal) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">Seçin</option>';
  data.Anbar_Listesi.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.PartiNo;
    opt.textContent = p.PartiNo + ' - ' + p.UrunAdi + ' (' + (p.StokMiktari || 0) + ' ' + (p.Birim || 'kg') + ')';
    if (selectedVal && p.PartiNo === selectedVal) opt.selected = true;
    el.appendChild(opt);
  });
}

function populateSupplierSelect(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = el.value;
  el.innerHTML = '<option value="">Tedarikçi Seçin</option>';
  data.Tedarikciler.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.FirmaAdi;
    opt.textContent = t.FirmaAdi;
    if (t.FirmaAdi === current) opt.selected = true;
    el.appendChild(opt);
  });
}

function populateSupplierFilter(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = el.value;
  el.innerHTML = '<option value="">Tüm Tedarikçiler</option>';
  data.Tedarikciler.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.FirmaAdi;
    opt.textContent = t.FirmaAdi;
    if (t.FirmaAdi === current) opt.selected = true;
    el.appendChild(opt);
  });
}

function refreshPersonFilter() {
  const el = document.getElementById('daily-person-filter');
  if (!el) return;
  const current = el.value;
  el.innerHTML = '<option value="">Tüm Personel</option>';
  getUsers().forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.Ad;
    opt.textContent = u.Ad;
    if (u.Ad === current) opt.selected = true;
    el.appendChild(opt);
  });
}

function navigateTo(target) {
  document.querySelectorAll('.tab-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.dropdown-item').forEach(d => d.classList.remove('active'));
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  const tab = document.querySelector(`.tab-item[data-target="${target}"]`);
  if (tab) tab.classList.add('active');
  const dd = document.querySelector(`.dropdown-item[data-target="${target}"]`);
  if (dd) dd.classList.add('active');
  const view = document.getElementById(target);
  if (view) view.classList.add('active');
  const ddMenu = document.getElementById('tab-dropdown');
  if (ddMenu) ddMenu.classList.remove('show');
  if (target === 'dashboard') refreshDashboard();
  if (target === 'warehouse') refreshWarehouse();
  if (target === 'month-view') refreshMonthView();
  if (target === 'years-view') refreshYearsView();
  if (target === 'stt-tracking') refreshSttTracking();
  if (target === 'tender-tracking') refreshTenders();
  if (target === 'suppliers') refreshSuppliers();
  if (target === 'drivers') refreshDrivers();
  if (target === 'entry') refreshEntryForm();
  if (target === 'exit') refreshExitForm();
  if (target === 'daily') { document.getElementById('daily-date').value = todayStr(); refreshDailyView(); }
  if (target === 'settings-view') refreshSettings();
}

let _selectedMonth = AY_INDEX;
let _selectedYear = new Date().getFullYear();

function buildMonthMenu() {
  const select = document.getElementById('months-year-select');
  if (!select) return;
  const prevYil = parseInt(select.value);
  populateYearSelect('months-year-select', prevYil || new Date().getFullYear());
  const yil = parseInt(select.value) || new Date().getFullYear();
  const container = document.getElementById('months-menu');
  if (!container) return;
  container.innerHTML = AYLAR.map((ay, i) => {
    const aktif = (i === _selectedMonth && yil === _selectedYear) ? ' active' : '';
    const count = data.Mal_Kabul.filter(t => { const d = new Date(t.Tarih); return d.getMonth() === i && d.getFullYear() === yil; }).length +
                  data.Urun_Cikis.filter(t => { const d = new Date(t.Tarih); return d.getMonth() === i && d.getFullYear() === yil; }).length;
    return `<a href="#" class="month-link${aktif}" data-month="${i}" data-year="${yil}" onclick="goToMonth(${i},${yil})">
      <i class="fa-regular fa-calendar"></i>
      <span>${ay} ${yil}</span>
      <span class="month-badge">${count}</span>
    </a>`;
  }).join('');
}

function goToMonth(ay, yil) {
  _selectedMonth = ay;
  _selectedYear = yil;
  document.querySelectorAll('.month-link').forEach(n => n.classList.remove('active'));
  const el = document.querySelector(`.month-link[data-month="${ay}"]`);
  if (el) el.classList.add('active');
  navigateTo('month-view');
}

function refreshDashboard() {
  const prods = data.Anbar_Listesi;
  document.getElementById('total-varieties').textContent = prods.length;
  const totalStock = prods.reduce((s, p) => s + (Number(p.StokMiktari) || 0), 0);
  document.getElementById('total-stock').textContent = _fmt(totalStock);
  const critical = prods.filter(p => (Number(p.StokMiktari) || 0) <= (Number(p.KritikLimit) || 0));
  document.getElementById('critical-count').textContent = critical.length;
  const allTx = [...data.Mal_Kabul.map(t => ({ ...t, tip: 'Giriş' })), ...data.Urun_Cikis.map(t => ({ ...t, tip: 'Çıkış' }))];
  const bugun = todayStr();
  const bugunTx = allTx.filter(t => t.Tarih === bugun);
  document.getElementById('today-transactions').textContent = bugunTx.length;
  const sonTx = allTx.sort((a, b) => (b.Tarih || '').localeCompare(a.Tarih || '')).slice(0, 15);
  const tbody = document.getElementById('recent-transactions-body');
  tbody.innerHTML = sonTx.map(t => `<tr>
    <td>${t.PartiNo || '-'}</td>
    <td>${formatDate(t.Tarih)}</td>
    <td><span style="color:${t.tip === 'Giriş' ? 'var(--success)' : 'var(--accent)'}">${t.tip === 'Giriş' ? 'Giriş' : 'Çıkış'}</span></td>
    <td>${t.UrunAdi || '-'}</td>
    <td>${t.Miktar ?? '-'}</td>
    <td>${(getProduct(t.PartiNo) || {}).Birim || '-'}</td>
    <td>${t.Not || t.TeslimAlan || ''}</td>
  </tr>`).join('');
  const criticalList = document.getElementById('critical-stock-list');
  if (critical.length === 0) {
    criticalList.innerHTML = '<p style="color:var(--success);text-align:center;font-size:0.85rem;">✅ Tüm stoklar normal seviyede.</p>';
  } else {
    criticalList.innerHTML = critical.slice(0, 10).map(p =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--warning-light);border-radius:6px;">
        <span style="font-weight:600;font-size:0.85rem;">${p.UrunAdi}</span>
        <span style="color:var(--accent);font-weight:700;font-size:0.85rem;">${p.StokMiktari || 0} ${p.Birim || ''}</span>
      </div>`
    ).join('');
  }
  const expiring = prods.filter(p => p.STT).sort((a, b) => (a.STT || '').localeCompare(b.STT || '')).slice(0, 15);
  const expEl = document.getElementById('expiring-products-list');
  if (expiring.length === 0) {
    expEl.innerHTML = '<p style="color:var(--text-secondary);text-align:center;font-size:0.9rem;">✅ STT girilmiş ürün bulunmuyor.</p>';
  } else {
    expEl.innerHTML = expiring.map(p => {
      const days = Math.ceil((new Date(p.STT) - new Date()) / (1000 * 60 * 60 * 24));
      const cls = days < 0 ? 'var(--accent)' : days <= 30 ? 'var(--warning)' : 'var(--success)';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--bg-card);border-radius:6px;border-left:3px solid ${cls};">
        <span style="font-weight:600;font-size:0.85rem;">${p.UrunAdi} (${p.PartiNo})</span>
        <span style="color:${cls};font-weight:700;font-size:0.85rem;">${formatDate(p.STT)} (${days < 0 ? 'GEÇTİ' : days + ' gün'})</span>
      </div>`;
    }).join('');
  }
  const personel = getUsers();
  const personelSummary = document.getElementById('personel-summary-list');
  personelSummary.innerHTML = personel.map(u => {
    const sayi = allTx.filter(t => t.Kullanici === u.Ad).length;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--bg-card);border-radius:6px;">
      <span style="font-weight:600;font-size:0.85rem;"><i class="fa-regular fa-user"></i> ${u.Ad}</span>
      <span style="color:var(--text-secondary);font-size:0.85rem;">${sayi} işlem</span>
    </div>`;
  }).join('');
}

let _warehouseFilter = { category: 'ALL', search: '', zeroHidden: false, criticalOnly: false };

function refreshWarehouse() {
  const prods = data.Anbar_Listesi;
  let filtered = [...prods];
  if (_warehouseFilter.category !== 'ALL') filtered = filtered.filter(p => p.Kategori === _warehouseFilter.category);
  if (_warehouseFilter.search) {
    const q = _warehouseFilter.search.toLowerCase();
    filtered = filtered.filter(p => (p.UrunAdi || '').toLowerCase().includes(q) || (p.PartiNo || '').toLowerCase().includes(q));
  }
  if (_warehouseFilter.zeroHidden) filtered = filtered.filter(p => (Number(p.StokMiktari) || 0) > 0);
  if (_warehouseFilter.criticalOnly) filtered = filtered.filter(p => (Number(p.StokMiktari) || 0) <= (Number(p.KritikLimit) || 0));
  const tbody = document.getElementById('anbar-body');
  tbody.innerHTML = filtered.map(p => {
    const crit = (Number(p.StokMiktari) || 0) <= (Number(p.KritikLimit) || 0);
    return `<tr${crit ? ' style="background:var(--warning-light);"' : ''}>
      <td style="font-weight:600;">${p.PartiNo}</td>
      <td>${p.Kategori || '-'}</td>
      <td><strong>${p.UrunAdi}</strong></td>
      <td style="font-weight:700;color:${crit ? 'var(--accent)' : 'var(--success)'};">${_fmt(p.StokMiktari || 0)}</td>
      <td>${p.Birim || '-'}</td>
      <td>${_fmt(p.KritikLimit || 0)}</td>
      <td>${formatDate(p.STT)}</td>
      <td style="text-align:right;">
        <button class="btn-ui btn-sm btn-outline" onclick="editProduct('${p.PartiNo}')" style="padding:3px 8px;font-size:10px;"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-ui btn-sm btn-outline" onclick="deleteProduct('${p.PartiNo}')" style="padding:3px 8px;font-size:10px;margin-left:4px;"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function editProduct(partiNo) {
  const p = getProduct(partiNo);
  if (!p) return;
  openProductModal(p);
}

function deleteProduct(partiNo) {
  if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return;
  data.Anbar_Listesi = data.Anbar_Listesi.filter(p => p.PartiNo !== partiNo);
  productMap.delete(partiNo);
  saveLocalCache();
  saveRow('Anbar_Listesi', data.Anbar_Listesi).catch(() => {});
  toast('Ürün silindi.', 'info');
  refreshWarehouse();
}

function refreshEntryForm() {
  populateSupplierFilter('entry-supplier-filter');
  populateProductSelect('entry-product');
  document.getElementById('entry-date').value = todayStr();
  const filter = document.getElementById('entry-supplier-filter');
  const prod = document.getElementById('entry-product');
  if (filter.value) {
    const matched = data.Anbar_Listesi.filter(p => p.Tedarikci === filter.value);
    prod.innerHTML = '<option value="">Seçin</option>';
    matched.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.PartiNo; opt.textContent = p.PartiNo + ' - ' + p.UrunAdi;
      prod.appendChild(opt);
    });
  }
}

function refreshExitForm() {
  populateProductSelect('exit-product');
  document.getElementById('exit-date').value = todayStr();
}

document.getElementById('entry-supplier-filter').addEventListener('change', refreshEntryForm);

document.getElementById('entry-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const partiNo = document.getElementById('entry-product').value;
  if (!partiNo) { toast('Lütfen ürün seçin.', 'error'); return; }
  const miktar = parseFloat(document.getElementById('entry-amount').value);
  if (!miktar || miktar <= 0) { toast('Geçerli miktar girin.', 'error'); return; }
  const row = {
    Tarih: document.getElementById('entry-date').value,
    PartiNo: partiNo,
    UrunAdi: (getProduct(partiNo) || {}).UrunAdi || '',
    Miktar: miktar,
    STT: document.getElementById('entry-stt').value || '',
    Tedarikci: document.getElementById('entry-note').value || '',
    Not: document.getElementById('entry-note').value || '',
    Kullanici: getActiveUser()
  };
  saveRow('Mal_Kabul', row).then(() => {
    const p = getProduct(partiNo);
    if (p) {
      p.StokMiktari = (Number(p.StokMiktari) || 0) + miktar;
      if (row.STT && (!p.STT || row.STT > p.STT)) p.STT = row.STT;
      saveLocalCache();
    }
    toast('Mal kabul kaydedildi.', 'success');
    document.getElementById('entry-amount').value = '';
    document.getElementById('entry-stt').value = '';
    document.getElementById('entry-note').value = '';
    loadData().then(() => {
      refreshAll();
      const v = document.querySelector('.view-section.active');
      if (v) { const id = v.id; if (id === 'entry') refreshEntryForm(); }
    });
  }).catch(() => toast('Kayıt hatası!', 'error'));
});

document.getElementById('exit-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const partiNo = document.getElementById('exit-product').value;
  if (!partiNo) { toast('Lütfen ürün seçin.', 'error'); return; }
  const miktar = parseFloat(document.getElementById('exit-amount').value);
  if (!miktar || miktar <= 0) { toast('Geçerli miktar girin.', 'error'); return; }
  const p = getProduct(partiNo);
  if (p && (Number(p.StokMiktari) || 0) < miktar) {
    if (!confirm('Stokta yeterli ürün yok! (Mevcut: ' + (p.StokMiktari || 0) + '). Yine de çıkış yapılsın mı?')) return;
  }
  const row = {
    Tarih: document.getElementById('exit-date').value,
    PartiNo: partiNo,
    UrunAdi: (p || {}).UrunAdi || '',
    Miktar: miktar,
    TeslimAlan: document.getElementById('exit-note').value || '',
    Not: document.getElementById('exit-note').value || '',
    Kullanici: getActiveUser()
  };
  saveRow('Urun_Cikis', row).then(() => {
    if (p) {
      p.StokMiktari = Math.max(0, (Number(p.StokMiktari) || 0) - miktar);
      saveLocalCache();
    }
    toast('Çıkış kaydedildi.', 'success');
    document.getElementById('exit-amount').value = '';
    document.getElementById('exit-note').value = '';
    loadData().then(() => {
      refreshAll();
      const v = document.querySelector('.view-section.active');
      if (v) { const id = v.id; if (id === 'exit') refreshExitForm(); }
    });
  }).catch(() => toast('Kayıt hatası!', 'error'));
});

function refreshDailyView() {
  const date = document.getElementById('daily-date').value;
  const year = parseInt(document.getElementById('daily-year-select').value) || new Date().getFullYear();
  const person = document.getElementById('daily-person-filter').value;
  const allTx = [
    ...data.Mal_Kabul.filter(t => t.Tarih).map(t => ({ ...t, tip: 'Giriş' })),
    ...data.Urun_Cikis.filter(t => t.Tarih).map(t => ({ ...t, tip: 'Çıkış' }))
  ];
  let filtered = allTx;
  if (date) filtered = filtered.filter(t => t.Tarih === date);
  if (person) filtered = filtered.filter(t => t.Kullanici === person);
  const giris = filtered.filter(t => t.tip === 'Giriş');
  const cikis = filtered.filter(t => t.tip === 'Çıkış');
  document.getElementById('daily-giris-adet').textContent = giris.length + ' İşlem';
  document.getElementById('daily-cikis-adet').textContent = cikis.length + ' İşlem';
  document.getElementById('daily-toplam-adet').textContent = filtered.length + ' İşlem';
  const baslik = date ? formatDate(date) : year;
  document.getElementById('daily-baslik').textContent = date ? 'Giren Ürünler - ' + formatDate(date) : 'Giren Ürünler - ' + year;
  const tbody = document.getElementById('daily-body');
  tbody.innerHTML = filtered.sort((a, b) => (a.Tarih || '').localeCompare(b.Tarih || '')).map((t, i) => {
    return `<tr>
      <td>${i + 1}</td>
      <td><span style="color:${t.tip === 'Giriş' ? 'var(--success)' : 'var(--accent)'}">${t.tip}</span></td>
      <td>${t.PartiNo}</td>
      <td>${t.UrunAdi}</td>
      <td>${t.Miktar ?? '-'}</td>
      <td>${(getProduct(t.PartiNo) || {}).Birim || '-'}</td>
      <td>${t.Not || t.TeslimAlan || '-'}</td>
    </tr>`;
  }).join('');
  refreshPersonFilter();
}

document.getElementById('daily-date').addEventListener('change', refreshDailyView);
document.getElementById('daily-year-select').addEventListener('change', refreshDailyView);
document.getElementById('daily-person-filter').addEventListener('change', refreshDailyView);

function refreshMonthView() {
  const ay = _selectedMonth;
  const yil = _selectedYear;
  document.getElementById('month-title').textContent = AYLAR[ay] + ' ' + yil + ' — Aylık Rapor';
  const girisler = data.Mal_Kabul.filter(t => { const d = new Date(t.Tarih); return d.getMonth() === ay && d.getFullYear() === yil; });
  const cikislar = data.Urun_Cikis.filter(t => { const d = new Date(t.Tarih); return d.getMonth() === ay && d.getFullYear() === yil; });
  document.getElementById('month-in-total').textContent = _fmt(girisler.reduce((s, t) => s + (Number(t.Miktar) || 0), 0));
  document.getElementById('month-out-total').textContent = _fmt(cikislar.reduce((s, t) => s + (Number(t.Miktar) || 0), 0));
  const inBody = document.getElementById('month-in-list');
  inBody.innerHTML = girisler.map(t => `<tr><td>${t.Tedarikci || t.Not || '-'}</td><td>${formatDate(t.Tarih)}</td><td>${t.UrunAdi}</td><td>${formatDate(t.STT)}</td><td>${t.Miktar ?? '-'}</td><td>${(getProduct(t.PartiNo) || {}).Birim || '-'}</td></tr>`).join('');
  const outBody = document.getElementById('month-out-list');
  outBody.innerHTML = cikislar.map(t => `<tr><td>${t.TeslimAlan || '-'}</td><td>${formatDate(t.Tarih)}</td><td>${t.UrunAdi}</td><td>${t.Miktar ?? '-'}</td><td>${(getProduct(t.PartiNo) || {}).Birim || '-'}</td></tr>`).join('');
}

function monthExportPrint() {
  const printWin = window.open('', '_blank');
  const girisler = data.Mal_Kabul.filter(t => { const d = new Date(t.Tarih); return d.getMonth() === _selectedMonth && d.getFullYear() === _selectedYear; });
  const cikislar = data.Urun_Cikis.filter(t => { const d = new Date(t.Tarih); return d.getMonth() === _selectedMonth && d.getFullYear() === _selectedYear; });
  let html = `<html><head><meta charset="utf-8"><title>Aylık Rapor ${AYLAR[_selectedMonth]} ${_selectedYear}</title>
    <style>body{font-family:sans-serif;padding:20px;}table{width:100%;border-collapse:collapse;margin-bottom:20px;}
    th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;}th{background:#f1f5f9;}
    h2{color:#2563eb;}h3{color:#16a34a;margin-top:24px;}</style></head><body>
    <h2>${AYLAR[_selectedMonth]} ${_selectedYear} Aylık Rapor</h2>
    <h3 style="color:#16a34a;">Girişler</h3>
    <table><thead><tr><th>Firma</th><th>Tarih</th><th>Ürün</th><th>STT</th><th>Miktar</th></tr></thead><tbody>
    ${girisler.map(t => `<tr><td>${t.Tedarikci || '-'}</td><td>${formatDate(t.Tarih)}</td><td>${t.UrunAdi}</td><td>${formatDate(t.STT)}</td><td>${t.Miktar ?? '-'}</td></tr>`).join('')}
    </tbody></table>
    <h3 style="color:#dc2626;">Çıkışlar</h3>
    <table><thead><tr><th>Firma</th><th>Tarih</th><th>Ürün</th><th>Miktar</th></tr></thead><tbody>
    ${cikislar.map(t => `<tr><td>${t.TeslimAlan || '-'}</td><td>${formatDate(t.Tarih)}</td><td>${t.UrunAdi}</td><td>${t.Miktar ?? '-'}</td></tr>`).join('')}
    </tbody></table></body></html>`;
  printWin.document.write(html);
  printWin.document.close();
  printWin.print();
}

let yearChart = null;

function refreshYearsView() {
  const yil = parseInt(document.getElementById('year-select').value) || new Date().getFullYear();
  const urunFilter = document.getElementById('year-product-filter').value;
  populateYearSelect('year-select', yil);
  const allTx = [
    ...data.Mal_Kabul.filter(t => t.Tarih).map(t => ({ ...t, tip: 'Giriş' })),
    ...data.Urun_Cikis.filter(t => t.Tarih).map(t => ({ ...t, tip: 'Çıkış' }))
  ];
  let filtered = allTx.filter(t => { const d = new Date(t.Tarih); return d.getFullYear() === yil; });
  if (urunFilter) filtered = filtered.filter(t => t.PartiNo === urunFilter || t.UrunAdi === urunFilter);
  const girisAy = new Array(12).fill(0);
  const cikisAy = new Array(12).fill(0);
  filtered.forEach(t => {
    const m = new Date(t.Tarih).getMonth();
    if (t.tip === 'Giriş') girisAy[m] += Number(t.Miktar) || 0;
    else cikisAy[m] += Number(t.Miktar) || 0;
  });
  document.getElementById('year-total-in').textContent = girisAy.reduce((a, b) => a + b, 0).toLocaleString('tr-TR') + ' Adet';
  document.getElementById('year-total-out').textContent = cikisAy.reduce((a, b) => a + b, 0).toLocaleString('tr-TR') + ' Adet';
  if (yearChart) yearChart.destroy();
  const ctx = document.getElementById('year-chart').getContext('2d');
  yearChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: AYLAR,
      datasets: [
        { label: 'Giriş', data: girisAy, backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 4 },
        { label: 'Çıkış', data: cikisAy, backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: getComputedStyle(document.body).getPropertyValue('--text-primary') } } },
      scales: { x: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') } },
        y: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') }, beginAtZero: true } } }
  });
  const urunSelect = document.getElementById('year-product-filter');
  const currentFilter = urunSelect.value;
  urunSelect.innerHTML = '<option value="">Tüm Ürünler</option>';
  data.Anbar_Listesi.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.PartiNo;
    opt.textContent = p.UrunAdi;
    if (p.PartiNo === currentFilter) opt.selected = true;
    urunSelect.appendChild(opt);
  });
  const tbody = document.getElementById('year-report-body');
  const sorted = filtered.sort((a, b) => (a.Tarih || '').localeCompare(b.Tarih || ''));
  tbody.innerHTML = sorted.map(t => {
    return `<tr><td>${formatDate(t.Tarih)}</td><td><span style="color:${t.tip === 'Giriş' ? 'var(--success)' : 'var(--accent)'}">${t.tip}</span></td><td>${t.UrunAdi}</td><td>${t.Miktar ?? '-'}</td><td>${(getProduct(t.PartiNo) || {}).Birim || '-'}</td><td>${t.Not || t.TeslimAlan || '-'}</td></tr>`;
  }).join('');
}

document.getElementById('year-select').addEventListener('change', refreshYearsView);
document.getElementById('year-product-filter').addEventListener('change', refreshYearsView);

function refreshSttTracking() {
  const filter = document.querySelector('.stt-filter-btn.active');
  const mod = filter ? filter.dataset.filter : 'all';
  const bugun = new Date();
  let items = data.Anbar_Listesi.filter(p => p.STT).map(p => {
    const sttDate = new Date(p.STT);
    const kalan = Math.ceil((sttDate - bugun) / (1000 * 60 * 60 * 24));
    return { ...p, kalanGun: kalan, stok: Number(p.StokMiktari) || 0 };
  });
  if (mod === 'expired') items = items.filter(p => p.kalanGun < 0 && p.stok > 0);
  else if (mod === 'approaching') items = items.filter(p => p.kalanGun >= 0 && p.kalanGun <= 30 && p.stok > 0);
  else if (mod === 'ok') items = items.filter(p => p.kalanGun > 30);
  else if (mod === 'bitti') items = items.filter(p => p.stok <= 0);
  const tbody = document.getElementById('stt-tracking-body');
  tbody.innerHTML = items.map(p => {
    const cls = p.kalanGun < 0 ? 'var(--accent)' : p.kalanGun <= 30 ? 'var(--warning)' : 'var(--success)';
    return `<tr>
      <td>${p.PartiNo}</td>
      <td>${p.UrunAdi}</td>
      <td style="font-weight:600;">${formatDate(p.STT)}</td>
      <td style="color:${cls};font-weight:700;">${p.kalanGun < 0 ? 'SÜRESİ GEÇTİ' : p.kalanGun + ' gün'}</td>
      <td>${_fmt(p.stok)} ${p.Birim || ''}</td>
      <td>${p.Tedarikci || '-'}</td>
    </tr>`;
  }).join('');
  document.getElementById('stt-filter-badge').textContent = items.length + ' ürün';
}

document.querySelectorAll('.stt-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.stt-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    refreshSttTracking();
  });
});

function sttExportData(format) {
  const items = data.Anbar_Listesi.filter(p => p.STT).map(p => ({
    'Parti No': p.PartiNo,
    'Ürün': p.UrunAdi,
    'STT': formatDate(p.STT),
    'Stok': p.StokMiktari || 0,
    'Birim': p.Birim || ''
  }));
  if (format === 'xlsx') {
    import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js').then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(items);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'STT');
      XLSX.writeFile(wb, 'STT_Takip.xlsx');
    }).catch(() => toast('XLSX kütüphanesi yüklenemedi.', 'error'));
  } else if (format === 'word') {
    let html = '<html><body><h2>STT Takip Listesi</h2><table border="1" cellpadding="6"><tr><th>Parti No</th><th>Ürün</th><th>STT</th><th>Stok</th><th>Birim</th></tr>';
    html += items.map(r => `<tr><td>${r['Parti No']}</td><td>${r['Ürün']}</td><td>${r['STT']}</td><td>${r['Stok']}</td><td>${r['Birim']}</td></tr>`).join('');
    html += '</table></body></html>';
    const blob = new Blob([html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'STT_Takip.doc'; a.click();
  } else if (format === 'print') {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><meta charset="utf-8"><title>STT Takip</title><style>body{font-family:sans-serif;padding:20px;}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px}th{background:#f1f5f9}</style></head><body><h2>STT Takip Listesi</h2><table><tr><th>Parti No</th><th>Ürün</th><th>STT</th><th>Stok</th><th>Birim</th></tr>`);
    items.forEach(r => w.document.write(`<tr><td>${r['Parti No']}</td><td>${r['Ürün']}</td><td>${r['STT']}</td><td>${r['Stok']}</td><td>${r['Birim']}</td></tr>`));
    w.document.write('</table></body></html>');
    w.document.close(); w.print();
  }
}

document.getElementById('stt-export-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const m = document.getElementById('stt-export-menu');
  m.style.display = m.style.display === 'block' ? 'none' : 'block';
});
document.querySelectorAll('.stt-export-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.getElementById('stt-export-menu').style.display = 'none';
    sttExportData(opt.dataset.format);
  });
});

function refreshTenders() {
  const tenders = data.Ihale_Takip || [];
  const tbody = document.getElementById('tender-body');
  tbody.innerHTML = tenders.map((t, i) => {
    const anlasma = Number(t.AnlasmaMiktari) || 0;
    const teslim = Number(t.TeslimAlinan) || 0;
    const kalan = Math.max(0, anlasma - teslim);
    const fiyat = Number(t.BirimFiyat) || 0;
    const sozlesme = anlasma * fiyat;
    const teslimTutar = teslim * fiyat;
    const oran = anlasma > 0 ? ((teslim / anlasma) * 100).toFixed(0) : '0';
    return `<tr>
      <td>${t.FirmaAdi}</td>
      <td>${t.Urun}</td>
      <td style="text-align:right">${_fmt(anlasma)}</td>
      <td style="text-align:right">${_fmt(teslim)}</td>
      <td style="text-align:right;font-weight:700;color:${kalan > 0 ? 'var(--warning)' : 'var(--success)'}">${_fmt(kalan)}</td>
      <td style="text-align:right">${_fmt(fiyat)} ₺</td>
      <td style="text-align:right">${_fmt(sozlesme)} ₺</td>
      <td style="text-align:right">${_fmt(teslimTutar)} ₺</td>
      <td style="text-align:right;font-weight:700;">%${oran}</td>
      <td style="text-align:right;">
        <button class="btn-ui btn-sm btn-outline" onclick="editTender(${i})" style="padding:3px 8px;font-size:10px;"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-ui btn-sm btn-outline" onclick="deleteTender(${i})" style="padding:3px 8px;font-size:10px;margin-left:4px;"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function editTender(idx) {
  const t = data.Ihale_Takip[idx];
  if (!t) return;
  document.getElementById('tender-edit-id').value = idx;
  document.getElementById('tender-company').value = t.FirmaAdi;
  document.getElementById('tender-product').value = t.Urun;
  document.getElementById('tender-quantity').value = t.AnlasmaMiktari;
  document.getElementById('tender-delivered').value = t.TeslimAlinan || 0;
  document.getElementById('tender-price').value = t.BirimFiyat;
  document.getElementById('tender-modal-title').textContent = 'İhale Düzenle';
  document.getElementById('tender-submit-text').textContent = 'Güncelle';
  document.getElementById('tender-modal').classList.add('show');
}

function deleteTender(idx) {
  if (!confirm('Bu ihaleyi silmek istediğinize emin misiniz?')) return;
  data.Ihale_Takip.splice(idx, 1);
  saveLocalCache();
  saveRow('Ihale_Takip', data.Ihale_Takip).catch(() => {});
  toast('İhale silindi.', 'info');
  refreshTenders();
}

document.getElementById('tender-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const editId = document.getElementById('tender-edit-id').value;
  const row = {
    FirmaAdi: document.getElementById('tender-company').value,
    Urun: document.getElementById('tender-product').value,
    AnlasmaMiktari: parseFloat(document.getElementById('tender-quantity').value) || 0,
    TeslimAlinan: parseFloat(document.getElementById('tender-delivered').value) || 0,
    BirimFiyat: parseFloat(document.getElementById('tender-price').value) || 0
  };
  if (editId !== '' && editId >= 0) {
    data.Ihale_Takip[editId] = row;
    saveLocalCache();
    saveRow('Ihale_Takip', data.Ihale_Takip).catch(() => {});
    toast('İhale güncellendi.', 'success');
  } else {
    data.Ihale_Takip.push(row);
    saveLocalCache();
    saveRow('Ihale_Takip', data.Ihale_Takip).catch(() => {});
    toast('İhale eklendi.', 'success');
  }
  document.getElementById('tender-modal').classList.remove('show');
  this.reset();
  document.getElementById('tender-edit-id').value = '';
  document.getElementById('tender-modal-title').textContent = 'Yeni İhale';
  document.getElementById('tender-submit-text').textContent = 'İhale Ekle';
  refreshTenders();
});

document.getElementById('add-tender-btn').addEventListener('click', () => {
  document.getElementById('tender-edit-id').value = '';
  document.getElementById('tender-form').reset();
  document.getElementById('tender-modal-title').textContent = 'Yeni İhale';
  document.getElementById('tender-submit-text').textContent = 'İhale Ekle';
  document.getElementById('tender-modal').classList.add('show');
});

document.getElementById('add-supplier-btn').addEventListener('click', () => {
  const name = document.getElementById('new-supplier-input').value.trim();
  if (!name) { toast('Tedarikçi adı girin.', 'error'); return; }
  if (data.Tedarikciler.some(t => t.FirmaAdi === name)) { toast('Zaten var.', 'warning'); return; }
  data.Tedarikciler.push({ FirmaAdi: name });
  saveLocalCache();
  saveRow('Tedarikciler', data.Tedarikciler).catch(() => {});
  document.getElementById('new-supplier-input').value = '';
  toast('Tedarikçi eklendi.', 'success');
  refreshSuppliers();
});

function refreshSuppliers() {
  const list = document.getElementById('supplier-list');
  list.innerHTML = data.Tedarikciler.map((t, i) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid var(--border-color);border-radius:8px;margin-bottom:6px;">
      <span style="font-weight:600;">${t.FirmaAdi}</span>
      <button class="btn-ui btn-sm btn-outline" onclick="deleteSupplier(${i})" style="color:var(--accent);border-color:var(--accent);"><i class="fa-solid fa-trash"></i></button>
    </div>`
  ).join('');
}

function deleteSupplier(idx) {
  if (!confirm('Bu tedarikçiyi silmek istediğinize emin misiniz?')) return;
  data.Tedarikciler.splice(idx, 1);
  saveLocalCache();
  saveRow('Tedarikciler', data.Tedarikciler).catch(() => {});
  toast('Tedarikçi silindi.', 'info');
  refreshSuppliers();
}

function refreshDrivers() {
  const drivers = data.Suruculer || [];
  const tbody = document.getElementById('driver-body');
  tbody.innerHTML = drivers.map((d, i) =>
    `<tr>
      <td><strong>${d.AdSoyad}</strong></td>
      <td>${d.Telefon || '-'}</td>
      <td>${d.Plaka || '-'}</td>
      <td>${d.Not || '-'}</td>
      <td style="text-align:right;">
        <button class="btn-ui btn-sm btn-outline" onclick="editDriver(${i})" style="padding:3px 8px;font-size:10px;"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-ui btn-sm btn-outline" onclick="deleteDriver(${i})" style="padding:3px 8px;font-size:10px;margin-left:4px;"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`
  ).join('');
}

function editDriver(idx) {
  const d = data.Suruculer[idx];
  if (!d) return;
  document.getElementById('driver-edit-id').value = idx;
  document.getElementById('driver-name').value = d.AdSoyad;
  document.getElementById('driver-phone').value = d.Telefon || '';
  document.getElementById('driver-plate').value = d.Plaka || '';
  document.getElementById('driver-note').value = d.Not || '';
  document.getElementById('driver-modal-title').textContent = 'Sürücü Düzenle';
  document.getElementById('driver-submit-text').textContent = 'Güncelle';
  document.getElementById('driver-modal').classList.add('show');
}

function deleteDriver(idx) {
  if (!confirm('Bu sürücüyü silmek istediğinize emin misiniz?')) return;
  data.Suruculer.splice(idx, 1);
  saveLocalCache();
  saveRow('Suruculer', data.Suruculer).catch(() => {});
  toast('Sürücü silindi.', 'info');
  refreshDrivers();
}

document.getElementById('driver-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const editId = document.getElementById('driver-edit-id').value;
  const row = {
    AdSoyad: document.getElementById('driver-name').value,
    Telefon: document.getElementById('driver-phone').value || '',
    Plaka: document.getElementById('driver-plate').value || '',
    Not: document.getElementById('driver-note').value || ''
  };
  if (editId !== '' && editId >= 0) {
    data.Suruculer[editId] = row;
    toast('Sürücü güncellendi.', 'success');
  } else {
    data.Suruculer.push(row);
    toast('Sürücü eklendi.', 'success');
  }
  saveLocalCache();
  saveRow('Suruculer', data.Suruculer).catch(() => {});
  document.getElementById('driver-modal').classList.remove('show');
  this.reset();
  document.getElementById('driver-edit-id').value = '';
  document.getElementById('driver-modal-title').textContent = 'Yeni Sürücü';
  document.getElementById('driver-submit-text').textContent = 'Sürücü Ekle';
  refreshDrivers();
});

document.getElementById('add-driver-btn').addEventListener('click', () => {
  document.getElementById('driver-edit-id').value = '';
  document.getElementById('driver-form').reset();
  document.getElementById('driver-modal-title').textContent = 'Yeni Sürücü';
  document.getElementById('driver-submit-text').textContent = 'Sürücü Ekle';
  document.getElementById('driver-modal').classList.add('show');
});

function refreshSettings() {
  const u = getUsers().find(x => x.Ad === getActiveUser());
  document.getElementById('settings-username').value = getActiveUser();
  document.getElementById('settings-role').value = u ? u.Rol : '';
  const list = document.getElementById('users-list-ul');
  list.innerHTML = getUsers().map((u, i) =>
    `<li style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;">
      <div><strong>${u.Ad}</strong><br><small style="color:var(--text-secondary);">${u.Rol || ''} ${u.Email ? '| ' + u.Email : ''}</small></div>
      <div style="display:flex;gap:6px;">
        <button class="btn-ui btn-sm btn-outline" onclick="editUser(${i})"><i class="fa-solid fa-pen"></i> Düzenle</button>
        <button class="btn-ui btn-sm btn-outline" onclick="deleteUser(${i})" style="color:var(--accent);border-color:var(--accent);"><i class="fa-solid fa-trash"></i></button>
      </div>
    </li>`
  ).join('');
  const s = getAyarlar();
  document.getElementById('auto-backup-time').value = s.autoBackupTime || '17:00';
  document.getElementById('auto-backup-toggle').checked = s.autoBackupEnabled === 'true';
}

function editUser(idx) {
  const u = getUsers()[idx];
  if (!u) return;
  document.getElementById('new-username-input').value = u.Ad;
  document.getElementById('new-user-email').value = u.Email || '';
  document.getElementById('new-user-password').value = u.Sifre || '';
  document.getElementById('new-user-role').value = u.Rol || '';
  document.getElementById('new-username-input').dataset.editIndex = idx;
  toast('Kullanıcı bilgilerini düzenleyin ve tekrar ekleyin.', 'info');
}

function deleteUser(idx) {
  if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return;
  data.Kullanicilar.splice(idx, 1);
  saveLocalCache();
  saveRow('Kullanicilar', data.Kullanicilar).catch(() => {});
  toast('Kullanıcı silindi.', 'info');
  refreshSettings();
  refreshUserSelect();
}

document.getElementById('profile-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const role = document.getElementById('settings-role').value.trim();
  const u = getUsers().find(x => x.Ad === getActiveUser());
  if (u) { u.Rol = role; toast('Unvan güncellendi.', 'success'); }
  saveLocalCache();
  saveRow('Kullanicilar', data.Kullanicilar).catch(() => {});
  refreshSettings();
});

document.getElementById('add-user-btn').addEventListener('click', function() {
  const name = document.getElementById('new-username-input').value.trim();
  if (!name) { toast('Ad Soyad gerekli.', 'error'); return; }
  const email = document.getElementById('new-user-email').value.trim();
  const password = document.getElementById('new-user-password').value;
  const role = document.getElementById('new-user-role').value.trim();
  const editIdx = document.getElementById('new-username-input').dataset.editIndex;
  if (editIdx !== undefined && editIdx !== '') {
    data.Kullanicilar[editIdx] = { Ad: name, Rol: role, Email: email, Sifre: password };
    delete document.getElementById('new-username-input').dataset.editIndex;
    toast('Kullanıcı güncellendi.', 'success');
  } else {
    if (getUsers().some(u => u.Ad === name)) { toast('Bu isimde kullanıcı zaten var.', 'warning'); return; }
    data.Kullanicilar.push({ Ad: name, Rol: role, Email: email, Sifre: password });
    toast('Kullanıcı eklendi.', 'success');
  }
  document.getElementById('new-username-input').value = '';
  document.getElementById('new-user-email').value = '';
  document.getElementById('new-user-password').value = '';
  document.getElementById('new-user-role').value = '';
  saveLocalCache();
  saveRow('Kullanicilar', data.Kullanicilar).catch(() => {});
  refreshSettings();
  refreshUserSelect();
});

document.getElementById('backup-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(dataToCache(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stokdosya_yedek_' + todayStr() + '.json';
  a.click();
  toast('Yedek indirildi.', 'success');
});

document.getElementById('restore-btn').addEventListener('click', () => {
  const file = document.getElementById('restore-file').files[0];
  if (!file) { toast('Lütfen bir .json dosyası seçin.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target.result);
      dataFromCache(json);
      saveLocalCache();
      toast('Veriler geri yüklendi. Sayfa yenileniyor...', 'success');
      setTimeout(() => location.reload(), 1500);
    } catch(err) { toast('Geçersiz JSON dosyası.', 'error'); }
  };
  reader.readAsText(file);
});

document.getElementById('reset-all-btn').addEventListener('click', () => {
  if (!confirm('Tüm veriler silinecek! Devam etmek istediğinize emin misiniz?')) return;
  if (!confirm('Bu işlem geri alınamaz. Son kez onaylıyor musunuz?')) return;
  data.Anbar_Listesi = []; data.Mal_Kabul = []; data.Urun_Cikis = [];
  data.Gunluk_Islemler = []; data.STT_Takip = [];
  data.Ihale_Takip = []; data.Tedarikciler = []; data.Suruculer = [];
  productMap.clear();
  saveLocalCache();
  saveRow('Anbar_Listesi', []).catch(() => {});
  saveRow('Mal_Kabul', []).catch(() => {});
  saveRow('Urun_Cikis', []).catch(() => {});
  saveRow('Ihale_Takip', []).catch(() => {});
  saveRow('Tedarikciler', []).catch(() => {});
  saveRow('Suruculer', []).catch(() => {});
  toast('Depo sıfırlandı.', 'info');
  refreshAll();
});

document.getElementById('auto-backup-toggle').addEventListener('change', function() {
  const idx = data.Ayarlar.findIndex(a => a.Anahtar === 'autoBackupEnabled');
  const val = this.checked ? 'true' : 'false';
  if (idx >= 0) data.Ayarlar[idx].Deger = val;
  else data.Ayarlar.push({ Anahtar: 'autoBackupEnabled', Deger: val });
  saveLocalCache();
  if (this.checked) scheduleAutoBackup();
});

document.getElementById('auto-backup-time').addEventListener('change', function() {
  const idx = data.Ayarlar.findIndex(a => a.Anahtar === 'autoBackupTime');
  if (idx >= 0) data.Ayarlar[idx].Deger = this.value;
  else data.Ayarlar.push({ Anahtar: 'autoBackupTime', Deger: this.value });
  saveLocalCache();
});

function scheduleAutoBackup() {
  const s = getAyarlar();
  const [h, m] = (s.autoBackupTime || '17:00').split(':').map(Number);
  const now = new Date();
  let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const diff = target - now;
  setTimeout(() => {
    document.getElementById('backup-btn').click();
    document.getElementById('backup-status-msg').textContent = '✅ Otomatik yedek alındı: ' + new Date().toLocaleString('tr-TR');
    if (document.getElementById('auto-backup-toggle').checked) scheduleAutoBackup();
  }, diff);
}

let _productModalMode = 'create';

function openProductModal(product) {
  if (product) {
    _productModalMode = 'edit';
    document.getElementById('np-is-edit').value = 'true';
    document.getElementById('np-id').value = product.PartiNo || '';
    document.getElementById('np-id').readOnly = true;
    document.getElementById('np-name').value = product.UrunAdi || '';
    document.getElementById('np-category').value = product.Kategori || 'Sebze';
    document.getElementById('np-unit').value = product.Birim || 'kg';
    document.getElementById('np-stock').value = product.StokMiktari || 0;
    document.getElementById('np-critical').value = product.KritikLimit || 50;
    document.getElementById('np-stt').value = product.STT || '';
    document.getElementById('np-company').value = product.Tedarikci || '';
    document.getElementById('submit-product-btn').innerHTML = '<i class="fa-solid fa-save"></i> Güncelle';
  } else {
    _productModalMode = 'create';
    document.getElementById('np-is-edit').value = 'false';
    document.getElementById('np-id').readOnly = false;
    document.getElementById('new-product-form').reset();
    document.getElementById('np-category').value = 'Sebze';
    document.getElementById('np-unit').value = 'kg';
    document.getElementById('np-critical').value = 50;
    document.getElementById('np-stock').value = 0;
    document.getElementById('submit-product-btn').innerHTML = '<i class="fa-solid fa-save"></i> Kartı Oluştur';
  }
  populateSupplierSelect('np-company');
  document.getElementById('new-product-modal').classList.add('show');
}

document.getElementById('close-modal').addEventListener('click', () => {
  document.getElementById('new-product-modal').classList.remove('show');
});

document.getElementById('new-product-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const partiNo = document.getElementById('np-id').value.trim().toUpperCase();
  if (!partiNo) { toast('Parti No gerekli.', 'error'); return; }
  const product = {
    PartiNo: partiNo,
    UrunAdi: document.getElementById('np-name').value.trim(),
    Kategori: document.getElementById('np-category').value,
    Birim: document.getElementById('np-unit').value.trim() || 'kg',
    StokMiktari: parseFloat(document.getElementById('np-stock').value) || 0,
    KritikLimit: parseInt(document.getElementById('np-critical').value) || 50,
    STT: document.getElementById('np-stt').value || '',
    Tedarikci: document.getElementById('np-company').value || ''
  };
  if (!product.UrunAdi) { toast('Ürün adı gerekli.', 'error'); return; }
  if (_productModalMode === 'create' && getProduct(partiNo)) {
    toast('Bu Parti No zaten var!', 'error');
    return;
  }
  addOrUpdateProduct(product);
  saveRow('Anbar_Listesi', data.Anbar_Listesi).catch(() => {});
  toast(_productModalMode === 'create' ? 'Ürün oluşturuldu.' : 'Ürün güncellendi.', 'success');
  document.getElementById('new-product-modal').classList.remove('show');
  refreshWarehouse();
  refreshEntryForm();
});

document.getElementById('quick-add-btn').addEventListener('click', () => openProductModal());

document.getElementById('np-add-supplier').addEventListener('click', () => {
  const name = prompt('Yeni tedarikçi adı:');
  if (name && name.trim()) {
    if (!data.Tedarikciler.some(t => t.FirmaAdi === name.trim())) {
      data.Tedarikciler.push({ FirmaAdi: name.trim() });
      saveLocalCache();
    }
    populateSupplierSelect('np-company');
    document.getElementById('np-company').value = name.trim();
  }
});

function exportData(format) {
  const dataArr = data.Anbar_Listesi.map(p => ({
    'Parti No': p.PartiNo,
    'Kategori': p.Kategori || '',
    'Ürün Adı': p.UrunAdi,
    'Stok Miktarı': p.StokMiktari || 0,
    'Birim': p.Birim || '',
    'Kritik Limit': p.KritikLimit || 0,
    'STT': formatDate(p.STT),
    'Tedarikçi': p.Tedarikci || ''
  }));
  if (format === 'xlsx') {
    import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js').then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(dataArr);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Anbar');
      XLSX.writeFile(wb, 'Anbar_Listesi.xlsx');
    }).catch(() => toast('XLSX kütüphanesi yüklenemedi.', 'error'));
  } else if (format === 'word') {
    let html = '<html><body><h2>Anbar Listesi</h2><table border="1" cellpadding="6"><tr><th>Parti No</th><th>Kategori</th><th>Ürün</th><th>Stok</th><th>Birim</th><th>Kritik</th><th>STT</th><th>Tedarikçi</th></tr>';
    html += dataArr.map(r => `<tr><td>${r['Parti No']}</td><td>${r['Kategori']}</td><td>${r['Ürün Adı']}</td><td>${r['Stok Miktarı']}</td><td>${r['Birim']}</td><td>${r['Kritik Limit']}</td><td>${r['STT']}</td><td>${r['Tedarikçi']}</td></tr>`).join('');
    html += '</table></body></html>';
    const blob = new Blob([html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'Anbar_Listesi.doc'; a.click();
  } else if (format === 'print') {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><meta charset="utf-8"><title>Anbar Listesi</title><style>body{font-family:sans-serif;padding:20px;}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px}th{background:#f1f5f9}</style></head><body><h2>Anbar Listesi</h2><table><tr><th>Parti No</th><th>Kategori</th><th>Ürün</th><th>Stok</th><th>Birim</th><th>Kritik</th><th>STT</th><th>Tedarikçi</th></tr>`);
    dataArr.forEach(r => w.document.write(`<tr><td>${r['Parti No']}</td><td>${r['Kategori']}</td><td>${r['Ürün Adı']}</td><td>${r['Stok Miktarı']}</td><td>${r['Birim']}</td><td>${r['Kritik Limit']}</td><td>${r['STT']}</td><td>${r['Tedarikçi']}</td></tr>`));
    w.document.write('</table></body></html>');
    w.document.close(); w.print();
  }
}

document.getElementById('export-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const m = document.getElementById('export-menu');
  m.style.display = m.style.display === 'block' ? 'none' : 'block';
});
document.querySelectorAll('.export-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.getElementById('export-menu').style.display = 'none';
    exportData(opt.dataset.format);
  });
});

function pdfCikti() {
  const style = document.createElement('style');
  style.id = 'pdf-style';
  style.textContent = `
    @media print {
      body * { visibility: hidden; }
      #daily, #daily * { visibility: visible; }
      #daily { position: absolute; left: 0; top: 0; width: 100%; }
      .stats-grid { display: grid !important; grid-template-columns: repeat(3,1fr) !important; gap: 16px !important; margin-bottom: 20px !important; }
      .stat-card { border: 1px solid #ccc !important; padding: 12px !important; border-radius: 8px !important; }
      .minimal-table { width: 100% !important; border-collapse: collapse !important; }
      .minimal-table th { background: #f1f5f9 !important; color: #000 !important; padding: 10px !important; border: 1px solid #ccc !important; }
      .minimal-table td { padding: 8px 10px !important; border: 1px solid #ddd !important; color: #000 !important; }
      .btn-ui, .theme-btn, .tab-actions { display: none !important; }
      .panel-container { box-shadow: none !important; border: 1px solid #ccc !important; }
      #daily-pdf-container { border: 1px solid #ccc !important; }
      h3 { font-size: 18px !important; margin-bottom: 12px !important; }
    }
    @page { margin: 15mm; }
  `;
  document.head.appendChild(style);
  window.print();
  setTimeout(() => { document.getElementById('pdf-style').remove(); }, 500);
}

function updateClock() {
  const el = document.getElementById('header-date');
  if (el) el.textContent = new Date().toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function refreshAll() {
  refreshUserSelect();
  buildMonthMenu();
  refreshPersonFilter();
  refreshDashboard();
  refreshWarehouse();
  refreshEntryForm();
  refreshExitForm();
  refreshSettings();
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

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('add-product-btn').addEventListener('click', () => openProductModal());
  document.getElementById('months-year-select').addEventListener('change', buildMonthMenu);
  loadData().then(() => {
    if (!getUsers().length) {
      data.Kullanicilar = [
        { Ad: 'Depo Şefi', Rol: 'Yönetici', Email: '', Sifre: '' },
        { Ad: 'Yardımcı Şef Ali', Rol: 'Depo Sorumlusu', Email: '', Sifre: '' }
      ];
      data.activeUser = 'Depo Şefi';
    }
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    refreshAll();
    updateClock();
    setInterval(updateClock, 10000);
    const s = getAyarlar();
    if (s.autoBackupEnabled === 'true') scheduleAutoBackup();
    document.getElementById('app-container').style.display = 'block';
  });
  document.querySelectorAll('.minimal-table').forEach(t => {
    if (!t.parentElement.classList.contains('table-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      t.parentNode.insertBefore(wrap, t);
      wrap.appendChild(t);
    }
  });
  const moreBtn = document.getElementById('tab-more-btn');
  const tabDropdown = document.getElementById('tab-dropdown');
  if (moreBtn && tabDropdown) {
    moreBtn.addEventListener('click', (e) => { e.stopPropagation(); tabDropdown.classList.toggle('show'); });
    document.addEventListener('click', (e) => {
      if (!tabDropdown.contains(e.target) && e.target !== moreBtn) tabDropdown.classList.remove('show');
    });
  }
});

document.querySelectorAll('.tab-item[data-target], .dropdown-item[data-target]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const target = item.dataset.target;
    if (target === 'month-view') {
      _selectedMonth = AY_INDEX;
      _selectedYear = new Date().getFullYear();
      document.querySelectorAll('.month-link').forEach(n => n.classList.remove('active'));
      const el = document.querySelector(`.month-link[data-month="${AY_INDEX}"]`);
      if (el) el.classList.add('active');
    }
    navigateTo(target);
  });
});

document.getElementById('active-user-select').addEventListener('change', (e) => {
  data.activeUser = e.target.value;
  saveLocalCache();
  refreshSettings();
  toast('Aktif kullanıcı: ' + data.activeUser, 'info');
});

document.querySelectorAll('.category-tag').forEach(tag => {
  tag.addEventListener('click', () => {
    document.querySelectorAll('.category-tag').forEach(t => t.classList.remove('active'));
    tag.classList.add('active');
    _warehouseFilter.category = tag.dataset.category;
    refreshWarehouse();
  });
});

document.getElementById('anbar-search').addEventListener('input', (e) => {
  _warehouseFilter.search = e.target.value;
  refreshWarehouse();
});

document.getElementById('filter-zero-btn').addEventListener('click', function() {
  _warehouseFilter.zeroHidden = !_warehouseFilter.zeroHidden;
  this.classList.toggle('active');
  refreshWarehouse();
});

document.getElementById('filter-critical-btn').addEventListener('click', function() {
  _warehouseFilter.criticalOnly = !_warehouseFilter.criticalOnly;
  this.classList.toggle('active');
  refreshWarehouse();
});
