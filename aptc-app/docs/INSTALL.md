# INSTALL — APTC-Electrical and Building (คู่มือติดตั้ง ภาษาไทย)

## 1. สิ่งที่ต้องมี
- Node.js 20+ (`node --version`) — มีแล้วที่ `D:\node\node-v24.13.0-win-x64`
- Python 3.11+ (`python --version`)
- MySQL 8 (ถ้าจะใช้จริง) — ถ้ายังไม่มี ใช้ SQLite ไปก่อนได้ (ค่าเริ่มต้น ไม่ต้องติดตั้ง)

## 2. รันแบบเร็ว (SQLite — ไม่ต้องตั้งค่าอะไร)

**ทางลัด:** ดับเบิลคลิก `aptc-app\APTC-Electrical-and-Building.exe` — สคริปต์จะเลือกพอร์ต backend ให้เอง
(8000 ถ้าว่าง ไม่งั้นใช้ 8010) แล้วส่งพอร์ตนั้นให้ frontend ผ่าน `VITE_API_PORT`
เปิดหน้าต่าง Backend + Frontend และเปิดเบราว์เซอร์ให้เลย · หยุดโปรแกรมด้วย `stop.bat`

Rebuild the launcher after edits: `build-launcher.bat` (source: `APTC-Launcher.cs`).

ถ้าต้องการรันเอง เปิด 2 หน้าต่าง terminal:

**หน้าต่างที่ 1 — Backend:**
```bat
cd "D:\Moo-2026\14 Program\APTC-Electrical and Building\aptc-app\backend"
pip install -r requirements.txt
python -m app.seed
python -m uvicorn app.main:app --port 8000 --host 0.0.0.0
```

**หน้าต่างที่ 2 — Frontend:**
```bat
cd "D:\Moo-2026\14 Program\APTC-Electrical and Building\aptc-app\frontend"
npm install
npm run dev -- --port 1183 --host --strictPort
```

เปิดเบราว์เซอร์: `http://localhost:1183` → Sign in เลือก `admin` / `gig` / `san`

> ตัวเว็บจะใช้ host ของหน้าที่เปิดอยู่เป็น host ของ API เอง (พอร์ต API มาจาก `VITE_API_PORT`,
> ค่าเริ่มต้น 8010) — จึงไม่ต้องตั้ง `VITE_API_URL` อีก และ IP เครื่องเปลี่ยนก็ไม่พัง
> ถ้า backend อยู่คนละเครื่อง/คนละพอร์ต ค่อยตั้ง `VITE_API_PORT` (หรือ `VITE_API_URL` เป็น URL เต็ม)

## 3. ให้เพื่อนในเครือข่ายเดียวกันเปิด (LAN)
1. หา IP เครื่องเรา: `ipconfig` ดู IPv4 (เช่น `133.124.150.22`)
2. เพื่อนเปิด: `http://133.124.150.22:1183` — ใช้ได้เลย ไม่ต้องตั้งค่าอะไรเพิ่ม
   (ตัวเว็บจะยิง API ไปที่ `http://133.124.150.22:<พอร์ต backend>` ให้เอง)
3. เปิด Firewall ให้พอร์ต 1183 และพอร์ต backend (8000/8010) — Windows Defender Firewall → Allow an app / Inbound rule

## 4. ใช้ MySQL จริง (production)
1. ติดตั้ง MySQL 8 + สร้าง database:
   ```sql
   CREATE DATABASE aptc CHARACTER SET utf8mb4;
   CREATE USER 'aptc'@'%' IDENTIFIED BY 'เปลี่ยนรหัส';
   GRANT ALL ON aptc.* TO 'aptc'@'%';
   ```
2. ติดตั้ง driver + ตั้งค่า:
   ```bat
   pip install pymysql
   set DATABASE_URL=mysql+pymysql://aptc:เปลี่ยนรหัส@localhost:3306/aptc
   python -m app.seed
   python -m uvicorn app.main:app --port 8000 --host 0.0.0.0
   ```
3. ตารางสร้างอัตโนมัติตอน start (`Base.metadata.create_all`) — ไม่ต้องรัน migration

## 5. โครงไฟล์
```
aptc-app/
  backend/
    app/main.py routers/catalog.py routers/ops.py models.py schemas.py deps.py seed.py
    uploads/plan|report|repair/   ← ไฟล์แนบเก็บในเครื่อง (metadata ใน DB)
    aptc.db                       ← SQLite (dev)
  frontend/
    src/pages: Dashboard FloorPlan Reports Repairs Panels Maintenance Suppliers Manage Login
    src/components/Shell.tsx (rail + topbar + fullscreen)   src/components/ui.tsx (PageHead·Kpi·Panel·Empty·Notice·Modal)
    src/lib/api.ts   src/lib/useFullscreen.ts   tokens.css (Bloom design tokens)
    src/index.css     ← Tailwind entry + shared primitives (.card .btn .chip .tbl .rail …)
    public/header-logo.svg        ← โลโก้ NSK ที่ใช้จริง (rail + หน้า sign in)
    public/aptc-layout.png        ← ภาพแปลนพื้นหลัง (render จาก APTC Layout.dwg)
  docs/DESIGN.md flow-report-repair.html flow-status-state.html er-model.html
```

## 6. ผู้ใช้ตัวอย่าง (Sign in แบบเลือกชื่อ — MVP ไม่มีรหัสผ่าน)
| username | ชื่อ | role |
|---|---|---|
| admin | Admin (Somchai) | admin — ทุกอย่าง |
| gig | Gig (Reporter) | reporter — แจ้งเสีย + ดู |
| san | San (Technician) | technician — รับงาน + บันทึกซ่อม |

## 7. อัปเดตข้อมูลจริง (ตำแหน่ง/จำนวนอุปกรณ์)
- หน้า **Manage**: เพิ่มห้อง/จุดติดตั้ง, อัปโหลดภาพแปลนใหม่, เปลี่ยนอุปกรณ์ (ประวัติเดิมยังอยู่)
- หน้า **Floor Plan**: ลาก marker ย้ายตำแหน่งได้เลย (admin/technician), ปุ่ม Add point → คลิกบนแปลน
- ตัวอย่างดูประวัติ: คลิก **L-005** — ติดตั้ง 2023-05-10, ซ่อม 2 ครั้ง, เปลี่ยน 1 ครั้ง, ล่าสุด 2024-11-02

## 7b. ข้อมูลตัวอย่างซัพพลายเออร์ (สำหรับทดสอบ)
```bat
cd aptc-app\backend
python -m app.seed_suppliers            :: สร้าง/รีเฟรชซัพพลายเออร์ตัวอย่าง 10 บริษัท
python -m app.seed_suppliers --purge    :: ลบเฉพาะที่สคริปต์สร้าง (ไม่แตะข้อมูลอื่น)
```
แต่ละบริษัทมี 2–3 ประเภทงาน, ข้อมูลผู้ติดต่อครบ, ประวัติผู้ติดต่อ 0–3 คน และงานซ่อมผูกกับจุดติดตั้งจริง
รายงานที่สร้างจะถูกปิดสถานะ `done` เพื่อไม่ให้ไปเพิ่มยอด "งานค้าง" ใน Dashboard
สคริปต์จดสิ่งที่สร้างไว้ที่ `backend/.demo_suppliers.json` — รันซ้ำได้ไม่สร้างข้อมูลซ้ำ
