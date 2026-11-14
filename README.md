<<<<<<< HEAD
# uai-spaceapps-spherex
UAI Club - NASA Space Apps Challenge 2026 Workspace
=======
# 🛰️ NASA SPHEREx & Planet X — Interactive Sky Map (Demo Phần A)

Dự án Demo chức năng Core **Interactive Sky Map (Phần A: Celestial Coordinates, Interactive Canvas, 6-HDU FITS Telemetry & URL State Sync)** cho đề bài [Planet X and SPHEREx](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/).

---

## 🚀 Cách chạy Local

1. Mở Terminal trong Antigravity IDE và chạy:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\server.ps1 -Port 8080
   ```
2. Mở trình duyệt truy cập: **`http://localhost:8080`**

---

## ✨ Các tính năng đã triển khai trong bản Demo

### 1. Đầu vào (Input Layer) — Hỗ trợ cả Người mới & Chuyên gia
- **Tìm kiếm cơ bản (Cho người mới):**
  - Bấm nút **🏆 Top Gợi Ý** để mở Bảng xếp hạng các thiên thể được yêu thích nhất (*Sedna*, *2012 VP113*, *Tinh vân Orion*, *Thiên hà Andromeda*, *Sao lùn nâu WISE 0855*, *Eris*...).
  - Khi click vào một thiên thể: Tự động điền `RA`, `Dec`, `FOV` vào 3 ô thông số và kích hoạt Camera bay thẳng đến mục tiêu (0ms độ trễ nhờ Curated Cache).
  - Hỗ trợ gõ tên bất kỳ và bấm **🔍 Tìm tên** (tích hợp **CDS Sesame API** để phân giải tên thiên thể quốc tế).
- **Tìm kiếm nâng cao (3 Ô Thông số):**
  - **Ô 1 (`RA`):** Hỗ trợ nhập độ thập phân (`0° → 360°`) hoặc Giờ-Phút-Giây (`03h 47m 21s`). Báo viền đỏ nếu nhập ngoài giới hạn.
  - **Ô 2 (`Dec`):** Hỗ trợ nhập độ thập phân (`-90° → +90°`) hoặc Độ-Phút-Giây (`+11d 57m 50s`). Báo lỗi nếu vượt quá cực Bắc/Nam thiên cầu.
  - **Ô 3 (`FOV` - Phạm vi nhìn / Zoom Level):** Kết hợp **Dropdown chọn tỷ lệ gợi ý** (`0.05°`, `0.1°`, `0.25°`, `0.5°`, `1.0°`, `5.0°`, `20.0°`) và **Thanh trượt Zoom**. Tự động cảnh báo khi chạm giới hạn phân giải quang học SPHEREx (`0.02°` ~ `6.2 arcsec/pixel`).

### 2. Ba tầng Đầu ra (3 Output Layers)
- **Output 1 — Với người dùng hiện tại (Interactive WebGL/Canvas):**
  - Hiệu ứng **Camera Fly-to mượt mà (Slerp + Parabolic Arc 1.5s)**.
  - **Vòng tròn sóng xung kích (Pulse Ring)** + **Tâm ngắm chữ thập (Target Reticle)** + **Thẻ nổi (Floating HUD Card)** hiển thị thông tin ngay cạnh mục tiêu.
  - Thao tác trực tiếp trên ảnh: **Kéo chuột (Pan)**, **Lăn chuột (Zoom)**, **Nhấp đúp chọn điểm**, kéo thanh trượt chỉnh **Độ sáng (Brightness)**, **Tương phản (Contrast)**, **Auto-Contrast**, **Khử bụi Hoàng Đạo (ZODI)** và trượt qua **102 dải sóng hồng ngoại ($0.75 - 5.0\ \mu\text{m}$)**.
- **Output 2 — Với hệ thống phía sau (Inspector HUD Drawer):**
  - Hiển thị gói **Image Cutout Preview** đúng kích thước FOV.
  - Bóc tách đủ **6 lớp HDU của Multi-Extension FITS (`IMAGE`, `WCS-WAVE`, `VARIANCE`, `FLAGS`, `ZODI`, `EPSF`)**.
  - Kiểm định **Cờ chất lượng ảnh (`FLAGS`)**: Cảnh báo Tia vũ trụ (thử chọn **Eris** để thấy vệt Cosmic Ray trên bản đồ!).
  - Vẽ **Đồ thị phổ 102 kênh tương tác** và cho phép **Tải file Raw `.FITS` chuẩn 2880-byte Header**.
- **Output 3 — Với người dùng thứ 3 (URL State Output):**
  - Tự động cập nhật thanh địa chỉ trình duyệt bằng **Debounce 300ms + `window.history.replaceState()`** (`?ra=...&dec=...&fov=...&band=...`).
  - Nút **🔗 Copy Link** để gửi cho đồng đội mở ra đúng vị trí ngay lập tức.

---

## 📁 Cấu trúc thư mục
- [index.html](file:///c:/Users/Lenovo/Downloads/UAI_NASA_HACKATHON/index.html) — Giao diện chính (Search Bar, Map Frame, Inspector HUD Drawer).
- [css/styles.css](file:///c:/Users/Lenovo/Downloads/UAI_NASA_HACKATHON/css/styles.css) — Thiết kế giao diện Sci-Fi NASA Mission Control.
- [js/curated-data.js](file:///c:/Users/Lenovo/Downloads/UAI_NASA_HACKATHON/js/curated-data.js) — Dữ liệu Curated Database & bộ sinh phổ 102 kênh hồng ngoại.
- [js/validator.js](file:///c:/Users/Lenovo/Downloads/UAI_NASA_HACKATHON/js/validator.js) — Kiểm tra giới hạn `RA`/`Dec`/`FOV`, quy đổi HMS/DMS và tích hợp CDS Sesame API.
- [js/sky-engine.js](file:///c:/Users/Lenovo/Downloads/UAI_NASA_HACKATHON/js/sky-engine.js) — Engine bản đồ tương tác, nội suy bay Slerp, Pan/Zoom và xử lý Shader.
- [js/app.js](file:///c:/Users/Lenovo/Downloads/UAI_NASA_HACKATHON/js/app.js) — Điều phối luồng hoạt động Input → 3 Outputs & tạo file `.FITS`.
- [server.ps1](file:///c:/Users/Lenovo/Downloads/UAI_NASA_HACKATHON/server.ps1) — Máy chủ HTTP chạy local tại cổng `8080`.
>>>>>>> 8608474 (feat: SPHEREx Interactive Sky Map (Part A Core) with Cosmic Playlists & NASA Benchmark Tests)
