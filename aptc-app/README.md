# APTC-Electrical and Building

Web app to manage rooms and equipment history on a floor plan — React 19 + Vite + TypeScript,
Tailwind 3.4, Lucide icons. **UI: Hallmark _Bloom_** — one token system in
[`frontend/tokens.css`](frontend/tokens.css), design notes in [`docs/DESIGN.md`](docs/DESIGN.md) § 4b.
Backend: Python FastAPI · MySQL/SQLite.

The shell fills whatever window it is opened in (fluid `100dvh` rail + content) and enters browser
fullscreen automatically on the first click on desktop and tablet — phones keep the normal window.
A toggle sits in the topbar. Logo: [`frontend/public/header-logo.svg`](frontend/public/header-logo.svg).

Plan image rendered from `APTC Layout.dwg`. Docs & flowcharts in [`docs/`](docs/).

## Quick start (SQLite, no setup)

**ทางลัด — ดับเบิลคลิก `APTC-Electrical-and-Building.exe`** (เปิด backend + frontend ให้อัตโนมัติ เลือกพอร์ต 8000/8010 ที่ว่างให้เอง
ส่งพอร์ต API ให้ frontend อัตโนมัติ — เปิดจาก `localhost` หรือ IP เครื่องก็ได้ผลเหมือนกัน) · ปิดด้วย `stop.bat`
Rebuild the launcher after edits: `build-launcher.bat` (source: `APTC-Launcher.cs`).

หรือรันเองทีละขั้น:
```bat
cd aptc-app\backend
pip install -r requirements.txt
python -m app.seed
python -m uvicorn app.main:app --port 8000 --host 0.0.0.0
```
```bat
cd aptc-app\frontend
npm install
npm run dev -- --port 1183 --host --strictPort
```
Open `http://localhost:1183` → Sign in as `admin` / `gig` / `san`.
LAN: colleagues open `http://<your-ip>:1183`. Full guide: [`docs/INSTALL.md`](docs/INSTALL.md) (Thai).

## Demo data for testing

Two seeders write realistic data — each undo-able with `--purge`:

**10 supplier records** — 2–3 trades each, full contact cards, contact history, and linked jobs:

```bat
cd aptc-app\backend
python -m app.seed_suppliers            :: create / refresh the 10 vendors
python -m app.seed_suppliers --purge    :: remove exactly what it created
```

**A 10-way board schedule on MDB-1** — MCB / RCBO / spare ways, full breaker specs, and all
20 electrical plan points linked to the way that feeds them:

```bat
python -m app.seed_panels               :: write the schedule
python -m app.seed_panels --purge       :: restore the panel + every point spec it changed
```

**10 detailed repair records** — different points, suppliers and costs (฿0 warranty job through
฿3,900), each with a note recording what was done and measured, two with a placeholder attachment:

```bat
python -m app.seed_repairs              :: write the repair records
python -m app.seed_repairs --purge      :: remove them + their placeholder files
```

**10 complete Lighting records** — every Lighting field the screen asks for (lamp type, brand,
model, wattage, supplier, P/O or the reason there is none, an attachment) plus real repair records
(report + repair pairs with technician, supplier, cost and a note) so the Timeline tab of each point
has a full history, and the equipment history behind it:

```bat
python -m app.seed_lighting              :: complete L-001…L-008 and add L-009 / L-010
python -m app.seed_lighting --purge      :: restore the eight originals, delete the two it made
```
