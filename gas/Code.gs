// ═══════════════════════════════════════════════════════════════
//  VeXeRe → Google Sheets Sync  |  Google Apps Script
//
//  Hướng dẫn deploy:
//  1. Mở script.google.com → New project
//  2. Paste toàn bộ file này vào Code.gs
//  3. Thay SPREADSHEET_ID bằng ID của Google Sheet (lấy từ URL)
//  4. Deploy → New deployment → Web app
//     - Execute as: Me
//     - Who has access: Anyone
//  5. Copy URL dạng: https://script.google.com/macros/s/XXXXX/exec
//  6. Paste URL đó vào tab Sheets trong Chrome Extension
//
//  Lần đầu sử dụng: chạy hàm setupSheets() để tạo cấu trúc sheet
// ═══════════════════════════════════════════════════════════════

const SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
const SYNC_SECRET    = 'NguyenThiThaoNhi';

const SHEET_NAMES = {
  driver:  'Lái xe',
  vehicle: 'Phương tiện',
  trip:    'Chuyến xe',
};

// Các cột của từng sheet — phải khớp với popup.js DRIVER_COLS / VEHICLE_COLS
const SHEET_HEADERS = {
  driver: [
    'ID', 'Họ tên', 'Số điện thoại', 'Email',
    'CMND/CCCD', 'Số bằng lái', 'Hạng bằng',
    'Ngày sinh', 'Địa chỉ', 'Trạng thái',
  ],
  vehicle: [
    'ID', 'Biển số', 'Loại xe', 'Số ghế',
    'Màu sắc', 'Hãng xe', 'Model', 'Năm SX',
    'Trạng thái', 'Ngày đăng kiểm', 'Số khung', 'Số máy',
  ],
  trip: [
    'Ngày', 'Mã chuyến', 'Tên chuyến', 'Giờ đi',
    'BKS', 'Tài xế', 'Trạng thái', 'Tổng ghế', 'Đã đặt',
  ],
};

// ── setupSheets(): chạy 1 lần để tạo cấu trúc sheet ─────────
// Vào GAS Editor → chọn hàm "setupSheets" → nhấn ▶ Run
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  Object.keys(SHEET_NAMES).forEach(function(type) {
    const sheetName = SHEET_NAMES[type];
    const headers   = SHEET_HEADERS[type];

    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    } else {
      sheet.clear();
    }

    // Header row
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange
      .setBackground('#1a73e8')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setFontSize(11);

    // Freeze header
    sheet.setFrozenRows(1);

    // Độ rộng cột hợp lý
    sheet.autoResizeColumns(1, headers.length);

    // Dòng hướng dẫn
    sheet.getRange(2, 1)
      .setValue('← Nhấn export trong Chrome Extension để điền dữ liệu')
      .setFontColor('#aaaaaa')
      .setFontStyle('italic');

    Logger.log('✅ Đã tạo sheet: ' + sheetName);
  });

  SpreadsheetApp.getUi().alert(
    '✅ Đã tạo 3 sheets:\n' +
    '• Lái xe (' + SHEET_HEADERS.driver.length + ' cột)\n' +
    '• Phương tiện (' + SHEET_HEADERS.vehicle.length + ' cột)\n' +
    '• Chuyến xe (' + SHEET_HEADERS.trip.length + ' cột)'
  );
}

// ── POST: nhận data từ Chrome Extension ──────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.secret !== SYNC_SECRET) {
      return jsonOut({ error: 'Unauthorized' });
    }

    const { type, columns, rows } = body;
    const sheetName = SHEET_NAMES[type];
    if (!sheetName) return jsonOut({ error: 'Unknown type: ' + type });
    if (!columns || !rows) return jsonOut({ error: 'Missing columns or rows' });

    const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    else        sheet.clearContents();

    if (rows.length === 0) {
      return jsonOut({ ok: true, written: 0, sheet: sheetName });
    }

    // Ghi header + data
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    sheet.getRange(2, 1, rows.length, columns.length).setValues(rows);

    // Định dạng header
    sheet.getRange(1, 1, 1, columns.length)
      .setBackground('#1a73e8')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, columns.length);

    // Ghi timestamp cập nhật
    const tsRow = rows.length + 3;
    sheet.getRange(tsRow, 1)
      .setValue('Cập nhật: ' + Utilities.formatDate(
        new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss'
      ))
      .setFontColor('#aaaaaa')
      .setFontStyle('italic');

    return jsonOut({ ok: true, written: rows.length, sheet: sheetName });

  } catch (err) {
    return jsonOut({ error: err.toString() });
  }
}

// ── GET: kiểm tra trạng thái service ─────────────────────────
function doGet(e) {
  try {
    const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheets = ss.getSheets().map(function(s) {
      const lastRow = s.getLastRow();
      return {
        name:    s.getName(),
        records: Math.max(0, lastRow - 1),
      };
    });
    return jsonOut({ ok: true, service: 'VeXeRe Sync', sheets: sheets });
  } catch (err) {
    return jsonOut({ ok: false, error: err.toString() });
  }
}

// ─────────────────────────────────────────────────────────────
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
