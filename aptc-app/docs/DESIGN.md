# APTC-Electrical and Building — DESIGN.md
**Hallmark · macrostructure: Workbench · tone: warm-utilitarian · anchor hue: terracotta**
Going with: audience = APTC facility staff (admin / reporter / technician) · use = manage floor-plan equipment + repair workflow · tone = utilitarian + professional.

> Primary language: English. Thai subtitles (small) only for long / hard-to-understand strings.
> Style: **Bloom** (warm-cream paper · terracotta accent · geometric-sans display) · Flowcharts: **diagram-design** (default skin) · Icons: Lucide React
> Logo: `frontend/public/header-logo.svg` (official NSK mark — used in the rail and on the sign-in screen).

## 1. System overview

Web app to manage rooms and in-building equipment history on top of a floor-plan image.

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS 3.4 + Lucide React
- **Backend:** Python FastAPI + SQLAlchemy + Pydantic v2
- **Database:** MySQL (production) / SQLite file (dev fallback, zero-install). Same SQLAlchemy models; switch via `DATABASE_URL`.
- **Files:** stored in folders on the server (`backend/uploads/plan|report|repair`), metadata in DB.
- **Run:** dev on the owner's PC (`npm run dev` + `uvicorn`), colleagues open via LAN URL (`http://<your-ip>:5173`). The page derives the API host from itself (`VITE_API_PORT`, default 8010), so no `VITE_API_URL` is needed and a changed IP never breaks it.
- **Plan image:** rendered from `APTC Layout.dwg` → `APTC Layout-preview.png` (structure) and
  `LAYOUT APTC UPDATE 19052026-Gig-san.pdf` → `aptc-pdf-preview.png` (with room names, default background).

## 2. Roles & permissions

| Role | EN | TH (sub) | Can do |
|---|---|---|---|
| `admin` | Administrator | ผู้ดูแลระบบ | Everything: building/rooms/points, categories, users, plan upload, drag-drop, close reports |
| `reporter` | Reporter | ผู้แจ้ง | Create fault reports (+photo), view plans & history, track own reports |
| `technician` | Technician | ช่าง | Update report status, record repairs (+cost, attachments), replace equipment |

Auth (MVP): simple login by username (seeded users, no password) → `X-User-Id` header. RBAC enforced in routers.
Real passwords/JWT are a phase-2 item (see §9).

## 3. Screens (Bloom workbench)

| # | Screen | EN title / TH sub | Contents |
|---|---|---|---|
| S1 | Dashboard | Dashboard / ภาพรวม | Stat strip (faulty points, open jobs, month cost, total points) · status donut · cost-by-category bars · pending list · recent timeline |
| S2 | Floor Plan | Floor Plan / แปลนอาคาร | Plan canvas (image bg + draggable markers — silhouette per category: **L = สี่เหลี่ยมผืนผ้าแนวตั้ง** (icon over code), **AC = สี่เหลี่ยมจัตุรัส**, **SEN = วงกลม**, **FAN = หกเหลี่ยม**, the rest pill — and for **Lighting** points the form offers a แนวนอน/แนวยืน override, kept in `spec.marker_layout`) · **one category at a time** (opens clean — pick a pill to show it, picked pill highlights) · search by code/name · click marker → detail below the plan with one section at a time · selected marker enlarges, others dim · edit mode (press-and-hold a marker to drag it, live % readout, edit/delete points) · add point lives inside edit mode: a popup form first (**ประเภทงาน · Work type required first** → หมวด shows only the categories of that trade (`categories.work_type`: ไฟฟ้า = L/P/SW/MDB/SEN/FAN/EL/EX · งานอาคาร = AC/W/FE · อื่นๆ = OT) → the rest stays locked until a category is picked, field order: work type · category · room · code · name · installed · marker (Lighting only) · notes), then drag/click the plan to place it (moves live with a % ghost marker, hint bar with Cancel) |
| S3 | Equipment Detail (drawer) | Point detail / รายละเอียดจุดติดตั้ง | **Lighting tabs: ภาพรวม · สเปก · ประวัติ only** (a lamp has no sub-units or upkeep programme, so units/upkeep are hidden for that category; other categories keep all five) · **reporting is a button, not a tab**: "แจ้งเสีย · Report" sits next to Update in the card head and opens the report popup (work type · symptom · reported date · recorder · note · attachment — all required, 500 MB; work type = ไฟฟ้า / งานอาคาร / อื่นๆ dropdown; ฟอร์มเดียวกันนี้ (components/ReportFault.tsx) เปิดได้จากหน้า Fault Reports ด้วย — ที่นั่นจะมีช่องเลือกจุดติดตั้งเพิ่ม) · **tables, not prose**: Overview = first installed · last repair · replacements · room · status (all as a table) · **Lighting spec table** = lamp type · brand · model · wattage · supplier · P/O (or why there is none) · attachment (open link), all required and editable from the point form · **Timeline table = the point's Repair Records** (all of it: # · date · report + symptom · action · cost · technician · supplier · file · note, newest first) with the install date + repair total under it, fed by the same reports/repairs the Repairs screen writes · incomplete Lighting points carry a ⚠ badge on the plan and a "ข้อมูลไม่ครบ n รายการ" chip in the detail |
| S4 | Reports | Fault Reports / งานแจ้งเสีย | Table (No. = **REP-YYYY-NNNN** รันต่อเนื่องตลอดปี · point · **ประเภทงาน (ไฟฟ้า/งานอาคาร/อื่นๆ)** · symptom · reporter · date · status · **รูป · Photo** · **File (Quotation) and P/R** — สองคอลัมน์นี้มีปุ่ม “open” เปิดไฟล์ได้จากตารางเลย) + status filter + **work-type dropdown filter** (พร้อมจำนวนต่อประเภท + "ยังไม่ระบุ") + detail modal (symptom, photo, **แนบไฟล์ · File (Quotation) and P/R** + ลิงก์เปิดไฟล์, reporter, date, work-type chip) + status advance buttons + **ปุ่ม “+ แจ้งเสีย · Report fault” มุมขวาบน** เปิดฟอร์มเดียวกับหน้าแปลนอาคาร (ต่างกันแค่มีตัวเลือกจุดติดตั้ง) — *File (Quotation) and P/R ย้ายมาจากหน้า Repair Records และเก็บไว้ที่ใบแจ้ง* |
| S5 | Repairs | Repair Records / บันทึกงานซ่อม | **เรียงตามเลขที่ใบแจ้ง (คอลัมน์ Report) — ใบใหม่สุดอยู่บน** · **No. = เลขรัน 1,2,3 จากล่างขึ้นบนตามลำดับใบแจ้ง** (ล่างสุด = 1 · ไม่ขยับตามตัวกรอง · เลข REP-YYYY-NNNN ของงานซ่อมยังเก็บไว้จริง ดูได้จาก tooltip และหน้ารายละเอียด) · ตัวกรองปียังคิดจากวันที่ P/O/ซ่อมเสร็จ · **ตาราง = No. · Report (เลข REP ของใบแจ้ง) · สถานะ · Status (ของใบแจ้ง) · ประเภทงาน (สืบทอดจากใบแจ้ง) · Point (code · room · name) · Action · P/O No. · วันที่ P/O · Cost · Supplier name · วันที่เริ่มซ่อม · วันที่ซ่อมเสร็จ · File (Quotation) and P/R · File (P/O (ตัวที่มีลายเซ็น))** — *ไม่มีคอลัมน์ช่างผู้ทำ (technician)* · **ประเภทงานของงานซ่อม = ประเภทงานของใบแจ้งที่ผูกอยู่** (ไม่มีคอลัมน์ของตัวเอง จึงตรงกับหน้าจออื่นเสมอ · ฟอร์มบันทึกโชว์แบบอ่านอย่างเดียว) · **ตารางแบบ dense** (`tbl-dense`): ตัวอักษร 12px (รหัส/วันที่/ตัวเลข 11px), แถวสูงเท่ากัน ~44px, กำหนดความกว้างคอลัมน์ด้วย `colgroup` + `table-layout: fixed` (ตารางกว้างขั้นต่ำ 1220px แล้วเลื่อนแนวนอนถ้าจอแคบ), ข้อความยาว (Action/Point/Supplier) ตัดด้วย ellipsis + `title` ให้ hover ดูเต็ม — ไม่มีการบีบจนบรรทัดซ้อน · **ไฟล์แนบ**: File (Quotation) and P/R แนบที่**ใบแจ้งเสีย** (หน้า Fault Reports) — ตาราง/หน้ารายละเอียดของงานซ่อมแค่แสดงลิงก์ให้กดเปิด · File (P/O (ตัวที่มีลายเซ็น)) ยังแนบที่งานซ่อมตามเดิม: ตัวอักษร 12px (รหัส/วันที่/ตัวเลข 11px), แถวสูงเท่ากัน ~44px, กำหนดความกว้างคอลัมน์ด้วย `colgroup` + `table-layout: fixed` (ตารางกว้างขั้นต่ำ 1220px แล้วเลื่อนแนวนอนถ้าจอแคบ), ข้อความยาว (Action/Point/Supplier) ตัดด้วย ellipsis + `title` ให้ hover ดูเต็ม — ไม่มีการบีบจนบรรทัดซ้อน · **free-text search + ปี dropdown (พร้อมจำนวนงานต่อปี) + supplier dropdown**, running total + attachment count chips · **edit-mode toggle** gates all writes · "+ New repair" button reveals a guided form on click · row → detail sheet: cost/date/sibling stats, full repair (supplier, P/O No. `APP-xxxxx`, วันที่ P/O, วันที่เริ่ม/เสร็จ, quotation + signed P/O attachments, note), inline edit, per-file upload (quotation / signed P/O), **linked report block** (symptom, status, reporter, photo, other repairs on that report) |
| S6 | Panels | Main Panels / ตู้ไฟ | **One row per board** (code, name/location, room, main amps, main-breaker spec + phase, breaker count with spare badge, fed-circuit count) · free-text search · **edit-mode toggle** gates all writes · "+ Add panel" button reveals a guided form on click · row → detail sheet: stat strip (main / breakers / fed points / spare), panel spec with inline edit, **per-breaker card (spec · purpose · what it controls · points it feeds with live status)** → **click a way to drill into its full record** (labelled fields, every fed point with status, edit/delete, back to panel), add/edit/delete breaker, unassigned-point warning |
| S7 | Maintenance | Maintenance / ล้าง-ทดสอบ | AC cleaning + sensor test logs without a fault report. **Toolbar: free-text search (point · room · performer · note · kind) + kind tab strip**, running total + **รวมค่าใช้จ่าย** chip + **N ไม่ผ่าน** chip when any fail · **edit-mode toggle** gates all writes · "+ New log" button reveals a guided form on click · row → detail sheet: cost/result/earlier-visit stats, full log (date, performer, kind, result, note), inline edit, **earlier visits on the same point** |
| S8 | Suppliers | Suppliers / ซัพพลายเออร์ | **Toolbar: free-text search (company · every work type · contact · phone · LINE · e-mail · notes · former contacts) + work-type dropdown + sort dropdown (company / jobs / cost / contact-changes)**, running total `shown / total`, filter bar with Clear, distinct no-match state · **edit-mode toggle** gates all writes · "+ Add supplier" button reveals a guided form on click · **multi-trade picker** (a contractor covers 2–3 trades) · row → detail sheet: stat strip, current contact (badge), **contact history** with periods, work types, company edit, linked repairs |
| S9 | Management | Management / จัดการข้อมูล | Cards: Building & plan · Rooms (+W×L×H dims) · Install points · Replace equipment + Users — plus plan-image upload |
| S10 | Login / role switch | Sign in / เข้าสู่ระบบ | Pick a seeded user (shows role) — MVP only |
**Marker language on plan (req. 6):** colour + Lucide icon + status label chip.
`normal`=green · `reported`=amber · `waiting`=orange · `repairing`=blue · `done`=slate (closed, fades back to green).
Category icons: Lightbulb (L), Plug (P), AirVent (AC), ToggleLeft (SW), PanelTop (MDB),
Droplets (W), Flame (SEN), Fan (FAN), FireExtinguisher (FE), Flashlight (EL), DoorOpen (EX), CircleHelp (OT).
Categories live in the `categories` table — migrate_spec adds FE/EL/EX/OT to existing databases,
seed.py includes them for fresh ones, so the “จุดใหม่ · New point” picker always lists all 12.

## 4. Key flows

Diagrams (diagram-design, default skin): `docs/flow-report-repair.html`, `docs/flow-status-state.html`, `docs/er-model.html`.

- **F1 Report fault:** click point (e.g. L-005) → detail → Report fault → symptom + photo + reporter + date → status `reported`.
- **F2 Triage & repair:** admin/tech moves `reported → waiting → repairing` → records repair (technician, cost, attachment) → `done` → point back to `normal`.
- **F3 Replace equipment:** on a point, retire old unit + activate new unit. Point code & full history stay; old/new units separable (`removed_at` + `status=retired`).
- **F4 Add point:** Management or plan "Add mode" → click on plan → x/y % saved → fill code/room/category.
- **F5 Move point:** in edit mode press and hold a marker → it follows the pointer with a live `x% , y%` readout → release → PATCH x/y (admin/tech only). A plain click (no movement) still opens the detail instead of moving the point.
- **F6 Change supplier contact:** open a supplier row → *เปลี่ยนผู้ติดต่อ* → type the new person. The outgoing contact is closed (`ended_at`) and kept, the new one opens (`is_current`). The table always shows who to call today plus how many times the account has changed hands. A period is logged **only when the person (name) changes** — editing the same person's phone/LINE/e-mail updates the open period in place, so the list stays a list of people. `started_at` is NULL for contacts that predate the history table; the UI says "ไม่ทราบวันเริ่ม" rather than inventing a date.
- **F7 Many trades per supplier:** a contractor usually covers several things, so work types live in `supplier_work_types` (one row per trade) and the picker is a multi-select over the trades already in use plus a box for a new one. The legacy `suppliers.work_type` column is kept as the `" / "`-joined summary and written by the single helper `_set_work_types()`; reads fall back to splitting that column when a supplier has no join rows yet. The filter tabs count **suppliers per trade**, so they intentionally sum to more than the supplier total.
- **F8 Which breaker feeds what:** each breaker carries its own spec (amps · poles · type · kA · brand), what it's for, and a free-text `controls` line. The *live* answer comes from the plan side instead of a second link table — an install point already stores `spec.panel_id` + `spec.breaker_no`, so a breaker's fed points are the points whose `breaker_no` matches its `position_no`. Anything wired to the board but not matched to a breaker shows up as an "unassigned" warning, which is the gap worth closing while you're in the sheet.

## 4c. Demo data for testing

Two seeders write realistic data and can undo exactly what they did:

**Suppliers** — `backend/app/seed_suppliers.py` writes 10 Thai facility vendors, each with 2–3 trades, a full contact card, a contact history (0–3 former people), and report+repair pairs on existing install points so jobs/costs are real. Reports are closed (`done`) so they never inflate the dashboard's open-job count.

**Panels** — `backend/app/seed_panels.py` writes a full **10-way schedule on MDB-1** (MCB / RCBO / spare, 3P and 1P+N ways, one way with no brand recorded, one carrying four points) and links all 20 electrical plan points to the way that feeds them by writing `panel_id` + `breaker_no` into each point's spec. `seed.py` builds the same schedule from the same `SCHEDULE` list, so a fresh install matches.

**Repairs** — `backend/app/seed_repairs.py` writes **10 detailed repair records** (report + repair pairs) across different points, rooms, suppliers and costs running from ฿0 (warranty) to ฿3,900, each with a note that records what was actually done and what was measured. Two carry a small placeholder attachment so the "open file" link is testable.

```bat
cd aptc-app\backend
python -m app.seed_suppliers            :: create / refresh the 10 vendors
python -m app.seed_suppliers --purge    :: remove exactly what it created
python -m app.seed_panels               :: write the 10-way board schedule
python -m app.seed_panels --purge       :: restore the panel + every point spec it changed
python -m app.seed_repairs              :: write the 10 detailed repair records
python -m app.seed_repairs --purge      :: remove them + their placeholder files
```

Each script records what it made in `backend/.demo_*.json` (runtime markers, not source); `--purge` reads those files and touches nothing else. Re-running is idempotent — trades, contacts and breakers are rebuilt, a repair is skipped when the same symptom already exists on that point, jobs are only created on a fresh supplier, and the panel seeder snapshots each point's original `panel_id` / `breaker_no` before overwriting so a purge puts them back verbatim.

Status is **point-level computed**: open report status wins; otherwise `normal`. Closed (`done`) reports stay in history.

## 4b. Design system — Bloom

The whole app renders one Hallmark **Bloom** system. `frontend/tokens.css` is the single source of
truth; `frontend/tailwind.config.js` maps those tokens onto Tailwind utility names (`bg-paper`,
`text-ink`, `border-rule`, `bg-accent`, …) and `src/index.css` carries the shared primitives
(`.app-shell`, `.rail`, `.card`, `.btn`, `.chip`, `.tab`, `.pill`, `.fld`/`.fld-hint`/`.inp`, `.tbl`,
`.empty`, `.switch` (edit-mode toggle), `.card-tools` (card search + filter + sort toolbar),
`.filter-pick` (icon + native select that opens the OS dropdown),
`.pick`/`.pick-chip` (multi-select work types),
`.contact-now`/`.contact-past` (contact history), `.stat-strip`,
`.notice`, `.sheet`). **No component declares a raw colour or font** — every value resolves to a token.
`Modal` closes on Escape and a backdrop click by default; a sheet that holds a form passes
`dismissOnBackdrop={false} dismissOnEscape={false}` so typing survives a stray click.

| Role | Token | OKLCH | Reads as |
|---|---|---|---|
| Page canvas | `--color-paper` | `oklch(98.2% 0.005 95)` | warm off-white `#faf9f5` |
| Rail / sunken band | `--color-paper-2` | `oklch(95.6% 0.010 88)` | sand `#f3f0e9` |
| Card surface | `--color-surface` | `oklch(100% 0 0)` | white |
| Hairline | `--color-rule` | `oklch(94.2% 0.009 86)` | `#f0ede6` |
| Ink | `--color-ink` | `oklch(26.5% 0.014 68)` | warm near-black `#352e26` |
| Muted / soft | `--color-muted` · `--color-soft` | `oklch(46% …)` · `oklch(54% …)` | 5.4:1 and 4.6:1 on paper |
| Accent | `--color-accent` | `oklch(56.1% 0.140 34)` | terracotta `#b85038` (5.0:1 with white) |

Status colours ship as tint + ink + line triplets (`--color-ok`, `--color-wait`, `--color-warn`,
`--color-work`, `--color-idle`) so a status chip always clears 4.5:1 on its own tint — the inks sit at
`oklch(45–47% …)` (measured 6.1–6.4:1 on their tint, 7.0–7.5:1 for a white glyph on the ink).

**Type.** Plus Jakarta Sans (display) + Inter (body) + JetBrains Mono (codes, money, dates), loaded
from Google Fonts in `index.html` with system fallbacks. Display type is always roman — never italic.
The scale lives in `--text-xs … --text-3xl`; the page title is `--text-xl` (22px).

**Shell.** `.app-shell` is a two-column grid — a full-height sand rail plus a scrolling main column —
sized to `100dvh`, so the app fills whatever window it is opened in:

| Width | Rail | Behaviour |
|---|---|---|
| ≥ 1024px | 232px, pinned full height | fluid main column, no max-width cap |
| < 1024px | off-canvas drawer + scrim | hamburger in the topbar opens it; the rail carries its own close button |

**Fullscreen.** `src/lib/useFullscreen.ts` requests browser fullscreen on the first user gesture of
each tab session (the Fullscreen API needs a gesture); the topbar toggle takes over after that. Both
the auto-request and the toggle are skipped on handhelds (`max-width: 767px` or a coarse pointer).

**Rules that must not regress.** `overflow-x: clip` on `html`/`body`; no two-line clickable text
(controls are `white-space: nowrap`); image-bearing grid tracks use `minmax(0, 1fr)`; `:focus-visible`
ring on every control; motion animates `transform`/`opacity` only, with `prefers-reduced-motion`
fallback. Verified at 320 / 375 / 414 / 768 / 1024 / 1280 / 1600 px across all nine routes.

## 5. Database schema (MySQL / SQLite via SQLAlchemy)

```
users(id, username UQ, name, role[admin|reporter|technician], active)
buildings(id, name_en, name_th, description)
floors(id, building_id→buildings, name_en, level, plan_image)
rooms(id, floor_id→floors, code UQ, name_en, name_th, room_type,
      width_m, length_m, height_m, floor_area_m2)            # หมวด 9
categories(id, code UQ [L|P|AC|SW|MDB|W|SEN|FAN], name_en, name_th, icon, color)
install_points(id, code UQ e.g. L-005, room_id→rooms, category_id→categories,
               name_en, x_pct, y_pct, installed_at, notes, spec JSON)  # หมวด 1-8
equipments(id, install_point_id→install_points, serial_no, brand_model,
           installed_at, removed_at NULL, status[active|retired], notes)
reports(id, install_point_id→install_points, equipment_id NULL→equipments,
        symptom, photo NULL, reporter_id→users, reported_at, status, note,
        work_type /* electrical|building|other */,
        code /* REP-YYYY-NNNN — รันต่อเนื่องยาวไปตลอดปี, เก็บไว้จริงไม่ขยับ */)
repairs(id, report_id→reports, technician_id→users, supplier_id NULL→suppliers,
        action, cost, repaired_at, started_at NULL, completed_at NULL, po_no,
        po_date NULL /* วันที่ในใบสั่งซื้อ — ใช้เรียงลำดับงาน */,
        attachment NULL, quotation_attachment NULL, po_attachment NULL, note,
        # งานซ่อมไม่เก็บ work_type ของตัวเอง — ใช้ของใบแจ้งที่ผูกอยู่ (ดูหัวข้อ S5)
        code /* REP-YYYY-NNNN — คนละชุดกับ reports แต่รูปแบบเดียวกัน */)
suppliers(id, company, work_type /* joined summary */, contact_name, phone, line_id, email, notes)  # หมวด 10
supplier_work_types(id, supplier_id→suppliers, name, sort_order)  # UNIQUE(supplier_id,name) — 1 บริษัทมีได้หลายประเภทงาน
supplier_contacts(id, supplier_id→suppliers, name, phone, line_id, email, note,
                  started_at NULL, ended_at NULL, is_current)   # contact-person periods
panels(id, code UQ e.g. MDB-1, room_id NULL→rooms, name_en, main_amps,
       main_breaker /* MCCB 100A 3P 25kA */, phase /* 3P 4W 400V */,
       location_note, notes)  # หมวด 4
breakers(id, panel_id→panels, position_no, amps, poles /*1P|1P+N|3P|4P*/,
         breaker_type /*MCB|MCCB|RCBO|ELCB*/, rated_ka, brand_model,
         purpose /*ใช้สำหรับอะไร*/, circuit_name, controls /*คุมอะไรบ้าง*/, notes)
sub_units(id, install_point_id→install_points, kind[faucet|sink|indoor|outdoor|gang|other],
          label, detail, status)                            # หมวด 5, 6
maintenances(id, install_point_id→install_points, kind[cleaning|test|inspection],
             performed_at, performer, result, cost, note)   # หมวด 6, 7
```

Per-category `spec` keys on install_points:
```
P:   {socket_type, panel_id, breaker_no}
SW:  {gang_count, controls:[point_ids], panel_id, breaker_no}
L:   {lamp_type, wattage, switch_point_id, panel_id, breaker_no}
MDB: {panel_code, main_amps, location_note}
W:   {fixture_type, valve_location, parent_point_id}
AC:  {brand, model, btu, indoor_note, outdoor_location, panel_id, breaker_no}
SEN: {sensor_type, model, zone, panel_id}
FAN: {model, size_inch, wattage, switch_point_id, panel_id, breaker_no}
```

Physical DDL: `backend/app/models.py` (SQLAlchemy) + `docs/er-model.html` (conceptual).
Upload folders: `backend/uploads/plan|report|repair/` (served at `/uploads/...`).

## 6. Auto-computed fields (no duplicate entry — req. brief)

Per install point, computed server-side from history:

- `first_installed_at` = MIN(equipments.installed_at, install_points.installed_at fallback)
- `repair_count` = COUNT(repairs JOIN reports WHERE reports.install_point_id = X)
- `replace_count` = COUNT(equipments) − 1 (min 0)
- `last_repair_at` = MAX(repairs.repaired_at)
- `current_status` = newest open report status else `normal`
- `total_cost` = SUM(repairs.cost)

Endpoint: `GET /api/points/{code}` returns point + `summary{...}` + `timeline[]` (install/replace/report/repair events, time-sorted).

## 7. API surface (FastAPI, prefix `/api`)

```
GET/POST /api/buildings  GET/PUT/DELETE /api/buildings/{id}
GET/POST /api/floors  (+POST /api/floors/{id}/plan  upload image)
GET/POST /api/rooms   GET/POST /api/categories
GET/POST /api/points  GET/PUT/DELETE /api/points/{id}  PATCH /api/points/{id}/position
GET /api/points/{code}            → detail + summary + timeline (L-005 example)
GET/POST /api/equipments  POST /api/points/{id}/replace
GET/POST /api/reports  GET/PATCH /api/reports/{id}  POST /api/reports/{id}/photo
GET/POST /api/repairs  GET/PUT /api/repairs/{id}  (+POST /api/repairs/{id}/attachment, supplier_id on create)
   (detail also returns `report{}` — symptom, status, reporter, photo and the
    report's other repairs as `siblings[]`)
GET /api/suppliers  POST /api/suppliers  GET /api/suppliers/{id}  PUT /api/suppliers/{id}
POST /api/suppliers/{id}/contacts   → hand the account to a new person
   (list rows carry `work_types[]` + `past_contacts[]`; PUT takes `work_types[]`
    and replaces the whole list — a supplier can cover several trades)
GET/POST /api/panels  PUT /api/panels/{id}  GET /api/panels/{id}
POST /api/breakers  PUT /api/breakers/{id}  DELETE /api/breakers/{id}
   (panel detail returns `breakers[]` each with its own `fed_points[]`, resolved
    by matching the point's `spec.breaker_no` to the breaker's `position_no`,
    plus `unassigned_points[]` for wiring that has no breaker yet)
GET /api/points/{pid}/subunits  POST /api/subunits  DELETE /api/subunits/{id}
GET/POST /api/maintenance   GET/PUT /api/maintenance/{id}
   (detail also returns `history[]` — earlier visits on the same point)
GET /api/dashboard → {faulty_points, open_jobs, month_cost, total_points, by_status, cost_by_category, pending[], recent[]}
GET/POST /api/users  POST /api/login {username} → user (MVP)

Migration for existing DBs: `python -m app.migrate_spec` (adds rooms dims, points.spec,
repairs.supplier_id; creates suppliers/panels/breakers/sub_units/maintenances).
```

## 8. Seed data (real values later — user will update)

Building `APTC` (single storey — one plan image), 10 rooms from the PDF
(LABORATORY 1/2, SOUND PROOF ROOM, TRAINING RM, MEASUREMENT RM, OFFICE, President Room,
Meeting A/B, CAD Room, CORRIDOR), categories L/P/AC, ~17 points (L-001..L-008 incl. **L-005**
full history: installed 2023-05-10, 2 repairs, 1 replacement, last repair 2024-11-02),
sample reports/repairs/users (admin/reporter/technician). Loader: `backend/app/seed.py`.

## 9. Non-goals / phase 2

Real password/JWT auth, multi-building maps, QR labels, preventive-maintenance scheduler,
LINE/Email notify, mobile app. Not in MVP; schema leaves room (users.password_hash ready).
