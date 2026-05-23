/**
 * STOKDOSYA — Google Apps Script
 *
 * KURULUM:
 * 1. Google Drive'da yeni bir Google Sheet oluşturun
 * 2. Uzantılar > Apps Script menüsüne tıklayın
 * 3. Bu kodun TAMAMINI yapıştırın (mevcut kodu silin)
 * 4. Ctrl+S ile kaydedin
 * 5. Dağıt > Yeni Dağıtım > Web Uygulaması
 * 6. Erişim: Herkes -> Dağıt
 * 7. Oluşan URL'yi kopyalayın
 * 8. index.html ile aynı klasördeki app.js dosyasında
 *    HARD_CODED_API_URL satırına yapıştırın
 */

const SHEET_URUNLER = "Urunler";
const SHEET_HAREKETLER = "Hareketler";
const SHEET_KULLANICILAR = "Kullanicilar";

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    const action = params.action || 'load';

    if (action === 'load') {
      return cikti(oku());
    }

    if (action === 'save') {
      const ham = params.data || '';
      if (!ham) return hata('Veri bulunamadı.');
      const veri = JSON.parse(ham);
      kaydet(veri);
      return cikti({ durum: 'tamam' });
    }

    return hata('Bilinmeyen aksiyon: ' + action);
  } catch (err) {
    return hata('Hata: ' + err.message);
  }
}

// ---------- Sheet'e bağlan (ister bağlı ister bağımsız script) ----------
function sheetAc() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch(e) {
    // Bağımsız script ise Sheet ID'sini kullan
    return SpreadsheetApp.openById('1iJRdWCYLNqxiO5ZN0OdWmde5PwlAl-piRPqXBDvGKww');
  }
}

// ---------- OKU (Sheet'ten veriyi çek) ----------
function oku() {
  const ss = sheetAc();

  // Ürünler
  let urunler = {};
  const uSheet = ss.getSheetByName(SHEET_URUNLER);
  if (uSheet) {
    const rows = uSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      urunler[r[0]] = {
        partiNo: r[0], name: r[1] || '', category: r[2] || '',
        unit: r[3] || 'kg', stock: parseInt(r[4]) || 0,
        criticalLevel: parseInt(r[5]) || 0, createdAt: r[6] || ''
      };
    }
  }

  // Hareketler
  let hareketler = [];
  const hSheet = ss.getSheetByName(SHEET_HAREKETLER);
  if (hSheet) {
    const rows = hSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      hareketler.push({
        id: Number(r[0]), type: r[1] || 'giris', partiNo: r[2] || '',
        productName: r[3] || '', amount: parseInt(r[4]) || 0,
        unit: r[8] || '', date: String(r[5]) || '', note: r[6] || '', timestamp: r[7] || ''
      });
    }
  }

  // Kullanıcılar
  let kullanicilar = [];
  let aktifKullanici = 'Depo Şefi';
  const kSheet = ss.getSheetByName(SHEET_KULLANICILAR);
  if (kSheet) {
    const rows = kSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      kullanicilar.push({ name: r[0], role: r[1] || 'Depo Personeli' });
    }
    if (rows.length > 0 && rows[0][2]) aktifKullanici = rows[0][2];
  }
  if (!kullanicilar.length) kullanicilar = [{ name: 'Depo Şefi', role: 'Yönetici' }];

  return {
    products: urunler,
    transactions: hareketler,
    users: kullanicilar,
    activeUser: aktifKullanici,
    settings: {}
  };
}

// ---------- KAYDET (tüm veriyi Sheet'e yaz) ----------
function kaydet(data) {
  const ss = sheetAc();

  // Sayfaları hazırla
  [SHEET_URUNLER, SHEET_HAREKETLER, SHEET_KULLANICILAR].forEach(ad => {
    if (!ss.getSheetByName(ad)) ss.insertSheet(ad);
  });

  // Ürünler
  let s = ss.getSheetByName(SHEET_URUNLER);
  s.clear();
  const uBaslik = ['PartiNo', 'Ürün Adı', 'Kategori', 'Birim', 'Stok', 'Kritik Limit', 'Oluşturma'];
  const uSatirlar = [uBaslik];
  if (data.products) {
    Object.values(data.products).forEach(p => {
      uSatirlar.push([p.partiNo, p.name, p.category, p.unit, p.stock, p.criticalLevel, p.createdAt || '']);
    });
  }
  if (uSatirlar.length > 0) {
    s.getRange(1, 1, uSatirlar.length, uBaslik.length).setValues(uSatirlar);
    s.getRange(1, 1, 1, uBaslik.length).setFontWeight('bold');
  }

  // Hareketler
  s = ss.getSheetByName(SHEET_HAREKETLER);
  s.clear();
  const hBaslik = ['ID', 'Tür', 'PartiNo', 'Ürün Adı', 'Miktar', 'Tarih', 'Açıklama', 'Zaman', 'Birim'];
  const hSatirlar = [hBaslik];
  if (data.transactions) {
    data.transactions.forEach(t => {
      hSatirlar.push([t.id, t.type, t.partiNo, t.productName, t.amount, t.date, t.note || '', t.timestamp || '', t.unit || '']);
    });
  }
  if (hSatirlar.length > 0) {
    s.getRange(1, 1, hSatirlar.length, hBaslik.length).setValues(hSatirlar);
    s.getRange(1, 1, 1, hBaslik.length).setFontWeight('bold');
  }

  // Kullanıcılar
  s = ss.getSheetByName(SHEET_KULLANICILAR);
  s.clear();
  const kBaslik = ['Kullanıcı', 'Rol', 'Aktif Kullanıcı'];
  const kSatirlar = [kBaslik];
  if (data.users) {
    data.users.forEach(u => {
      kSatirlar.push([u.name, u.role || 'Depo Personeli', '']);
    });
  }
  if (data.activeUser && kSatirlar.length > 1) kSatirlar[0][2] = data.activeUser;
  if (kSatirlar.length > 0) {
    s.getRange(1, 1, kSatirlar.length, kBaslik.length).setValues(kSatirlar);
    s.getRange(1, 1, 1, kBaslik.length).setFontWeight('bold');
  }

  // Kolon genişlikleri
  ss.getSheets().forEach(sheet => sheet.autoResizeColumns(1, 8));
}

// ---------- YARDIMCILAR ----------
function cikti(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function hata(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- TEST (Apps Script editöründen çalıştır) ----------
// Bu fonksiyonu Apps Script editöründe seçip "Çalıştır" deyin.
// Sayfaları oluşturup örnek veri ekler. Sonra web uygulamasını test edin.
function testKur() {
  const testVeri = {
    products: {
      "DOM-2026-001": { partiNo: "DOM-2026-001", name: "Salkım Domates", category: "Sebze", unit: "kg", stock: 340, criticalLevel: 50, createdAt: new Date().toISOString() },
      "ELM-2026-001": { partiNo: "ELM-2026-001", name: "Elma (Golden)", category: "Meyve", unit: "kg", stock: 420, criticalLevel: 60, createdAt: new Date().toISOString() },
    },
    transactions: [
      { id: 1, type: "giris", partiNo: "DOM-2026-001", productName: "Salkım Domates", amount: 340, unit: "kg", date: "2026-05-20", note: "İlk giriş", timestamp: new Date().toISOString() },
      { id: 2, type: "giris", partiNo: "ELM-2026-001", productName: "Elma (Golden)", amount: 420, unit: "kg", date: "2026-05-20", note: "İlk giriş", timestamp: new Date().toISOString() },
    ],
    users: [{ name: "Depo Şefi", role: "Yönetici" }],
    activeUser: "Depo Şefi",
    settings: {}
  };
  kaydet(testVeri);
  console.log('✅ Test verisi yüklendi! Sheet\'i kontrol edin.');
}

// URL'yi tarayıcıda açınca test mesajı göstersin
function test() {
  return cikti({ mesaj: 'STOKDOSYA çalışıyor ✅' });
}
