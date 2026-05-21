
# VeXeRe Data Fetcher Extension

Extension này cung cấp giao diện với 3 nút để lấy dữ liệu tuyến, tài xế, phương tiện từ API VeXeRe. Header (token, cookie, ...) có thể tự động lấy từ file `.vexere-headers.json` trong workspace.

## Cách sử dụng
1. Cập nhật file `.vexere-headers.json` với token/cookie thực tế.
2. Cài đặt extension vào VS Code.
3. Chạy lệnh "Nhà xe: Lấy dữ liệu" để mở giao diện.
4. Bấm nút để lấy dữ liệu mong muốn.

## Cấu trúc file
- `package.json`: Manifest extension
- `src/extension.js`: Mã nguồn chính
- `.vexere-headers.json`: Lưu các header cần thiết

## Tuỳ chỉnh
- Có thể mở rộng để tự động lấy token từ Chrome extension hoặc lưu vào file này.
