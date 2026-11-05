# RB Public School — Enterprise School Management ERP

A complete, offline-capable school operations platform built for **RB Public School** to manage admissions, fee collection, transport routes, staff payroll records, class allocations, daily attendance, examinations, notices, and full system backups from a single unified workspace.

## User Review & Critical Decisions

> [!IMPORTANT]
> All core product preferences from our planning check-in have been locked into this blueprint. Review the architecture below and click **Proceed** when ready to build.

- **Confirmed Storage & Sign-In**: Offline browser persistence with full JSON backup export and JSON restore import, paired with a local Staff/Admin Email & Password authentication gate (supporting account creation and persistent login sessions).
- **Confirmed Initial Data State**: Clean, zero-record database ready immediately for live RB Public School entries—no pre-filled dummy students, fees, staff, or notices. Standard school classes (Nursery through 5th with Sections A, B, C) are initialized as structural containers with zero enrolled students, and custom classes/sections can be added or modified at any time.
- **Confirmed Printable Official Documents**: Formatted, print-ready document previews (`@media print` A4/slip layouts) included for all four requested school records:
  1. Official Fee Payment Receipts
  2. Student Exam Report Cards
  3. Student Admission Confirmation Slips
  4. Daily Attendance Register Sheets
- **Confirmed Workspace Navigation**: Top header bar paired with the 4 live KPI overview cards and a responsive 9-module horizontal tab navigation bar for one-click switching.

---

## 1. Overview & Core Concept

- **What It Does**: Centralizes day-to-day school administration into nine interconnected modules where every entry immediately updates live school metrics, relational dropdowns (such as linking active bus routes to student admissions, and admitted students to fee collection, attendance sheets, and exam gradebooks), and printable official records.
- **Target Audience / Persona**: School Principal, Front-Desk Admission & Fee Clerks, Transport Coordinators, and Class Teachers operating on desktop or tablet terminals.
- **Key Value**: Zero cloud configuration or external dependencies required—runs instantaneously in the browser with automatic local persistence, strict numeric validation, instant search/filtering, print-ready school stationery layouts, and portable JSON backups.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Staff Authentication Gate**: Staff arrive at a clean centered login card with Email, Password, and a "Create Account" toggle. Creating an account or signing in establishes an active session and transitions smoothly into the ERP workspace; clicking "Sign Out" in the top bar locks the session immediately.
  2. **Live Executive Overview**: At the top of the workspace, four real-time KPI cards continuously aggregate Total Students, Total Fee Collected (`₹`), Staff & Teachers Strength, and Active Transport Routes.
  3. **Interconnected Module Operations**: Staff switch across the 9 modules via the top tab bar:
     - Adding a bus route in **Transport & Route Manager** immediately populates the route selector inside **Student Directory & Full Admission**.
     - Admitting a student auto-generates a unique Admission ID (`RB1001`, `RB1002`...), updates class occupancy in **Class & Section Allocation**, enables **Admission Confirmation Slip** printing, and makes the student selectable in **Fee Collection**, **Daily Attendance**, and **Examination & Gradebook**.
     - Collecting fees auto-generates a Receipt No (`REC90001`...), sanitizes currency amounts, updates the school's Total Fee KPI, and opens an **Official Fee Payment Receipt** for printing.
     - Loading a class and date in **Daily Attendance Tracker** lists matching students with `Present` / `Absent` / `Late` segmented toggles, saves the register for that date, and formats a **Daily Attendance Register Sheet** for printing.
     - Logging marks (`0–100` across English, Hindi, Maths, Science) in **Examination & Gradebook** computes Total Score (`400`), Percentage (`%`), Pass/Fail status (`>= 33%`), and generates a printable **Student Exam Report Card**.
  4. **Data Portability & Safety**: In **Settings & System Control**, administrators monitor local storage health, export a timestamped `.json` backup of the entire school database, restore from a backup file, or perform a protected two-step confirmation reset.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Crisp, authoritative institutional SaaS dashboard—calm, high-contrast, clutter-free, and engineered for rapid clerical data entry and scanning.
  - *Color Palette & Mood (60-30-10 Discipline)*:
    - **60% Dominant Canvas**: Cool Alabaster Slate (`#F8FAFC` / `slate-50`) for effortless all-day readability.
    - **30% Structural Surfaces**: Pure White (`#FFFFFF`) flat single-elevation panels and tables separated by `1px` hairline borders (`slate-200`), paired with deep Slate (`slate-900`) primary ink and `slate-500` secondary labels.
    - **10% Accent & Semantic State**: Royal Indigo (`indigo-600`) reserved strictly for primary actions and active tab state; Emerald (`emerald-600`) for Paid, Present, and Passed states; Amber (`amber-600`) for Late/Pending; Rose (`rose-600`) for Absent, Failed, and Delete actions. Every semantic color is paired with explicit text labels for accessibility.
  - *Typography & Hierarchy*:
    - **Display & Brand**: `Plus Jakarta Sans` (SemiBold/Bold) for institutional headings, KPI titles, and modal headers.
    - **Body & Controls**: `DM Sans` (Regular/Medium) for forms, table prose, and navigation tabs (`whitespace-nowrap`).
    - **Tabular Numerals & Identifiers**: `JetBrains Mono` with `tabular-nums` for all Admission IDs, Receipt Numbers, Staff IDs, Indian Rupee (`₹`) totals, marks, percentages, and dates so columns align with decimal precision.
  - *Component Styling & Layout*: Full-width desktop layout (`max-w-7xl` centered container) featuring a single-row Top Bar, a 4-column KPI strip, a 9-tab horizontal module bar, and high-density data tables (`40px` row rhythm, left-aligned text, right-aligned numbers). Static metadata uses clean unboxed typography with `·` separators rather than cluttered badge sandwiches.

- **Interactive Feedback & Motion**:
  - Instant (`<= 150ms`) tab switching and modal transitions using subtle opacity/scale settling.
  - Zero browser popups (`window.alert` / `window.confirm` avoided for iframe compatibility)—replaced by a clean toast notification system and inline confirmation modals for destructive actions (record deletion and system reset).
  - Purpose-built empty states in every module when starting with zero records, featuring clear guidance and a direct primary action button (e.g., *"Add First Student"*, *"Create Bus Route"*).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Local-First Storage Engine with JSON Backup & Restore**
  - *Chosen Approach*: Synchronize all school collections automatically to structured browser `localStorage` under a versioned namespace, paired with one-click JSON file download and JSON file import in Settings.
  - *Why*: Matches your preference for zero external cloud setup, works 100% offline without latency or quota limits, persists across browser refreshes, and gives school staff full ownership of portable backup files.
  - *Alternatives Considered*: Cloud database provisioning—passed over per your selection to keep setup instant and self-contained.

- **Decision 2: Dedicated Print-Preview Sheet & `@media print` Stylesheet**
  - *Chosen Approach*: Render an on-screen RB Public School official stationery preview modal for Admission Slips, Fee Receipts, Attendance Registers, and Exam Report Cards, wired to `window.print()` with print-specific CSS that hides all dashboard chrome.
  - *Why*: Avoids blocked popup windows (`window.open`) inside embedded environments while delivering crisp, ink-friendly A4 and receipt layouts with school header, official signature lines, and tabular breakdowns.

- **Decision 3: Password Hashing & Multi-Staff Account Registry**
  - *Chosen Approach*: Store registered staff accounts locally using Web Crypto SHA-256 password hashing rather than plain-text passwords, alongside active session persistence.
  - *Why*: Preserves the exact Email + Password + "Create Account" login workflow specified in your prompt while respecting basic credential hygiene on shared school computers.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         RB PUBLIC SCHOOL ERPSHELL                            │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Auth Session Gate (Login / Create Account Card  <-->  Active Top Bar)  │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      │ Authenticated Session                 │
│                                      ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Live KPI Aggregator Strip (Students │ Fees ₹ │ Staff │ Bus Routes)     │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      │                                       │
│  ┌───────────────────────────────────▼────────────────────────────────────┐  │
│  │ 9-Module Responsive Tab Bar                                            │  │
│  ├───┬──────────────┬──────────────┬──────────────┬──────────────┬────────┤  │
│  │ 1 │ Admissions   │ 2 │ Fees ₹   │ 3 │ Routes   │ 4 │ Staff    │ 5 │Cls │  │
│  ├───┼──────────────┼───┼──────────┼───┼──────────┼───┼──────────┴───┴────┤  │
│  │ 6 │ Attendance   │ 7 │ Exams    │ 8 │ Notices  │ 9 │ Settings & Backup │  │
│  └───┴──────────────┴───┴──────────┴───┴──────────┴───┴───────────────────┘  │
│                                      │                                       │
│          ┌───────────────────────────┼───────────────────────────┐           │
│          ▼                           ▼                           ▼           │
│  ┌───────────────────┐     ┌───────────────────┐     ┌────────────────────┐  │
│  │ Form Modals &     │     │ High-Density Data │     │ Print Stationery   │  │
│  │ Inline Validators │     │ Grids & Filters   │     │ Engine (4 Layouts) │  │
│  └─────────┬─────────┘     └─────────▲─────────┘     └─────────▲──────────┘  │
│            │ Mutations               │ Reactive Reads          │ Document    │
│            ▼                         │                         │ Data        │
│  ┌───────────────────────────────────┴─────────────────────────┴──────────┐  │
│  │ Central School Store (React Context + Versioned LocalStorage Sync)     │  │
│  │  • accounts[]  • students[]  • fees[]  • routes[]  • staff[]           │  │
│  │  • classes[]   • attendance{} • grades[] • notices[]                   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **Staff Accounts & Session**: Stores account ID, email, hashed password, creation timestamp, and active session email.
- **Students (`students[]`)**: Auto-generated `admissionId` (`RB1001`+), full name, gender, DOB, `className` (`Nursery`–`5th` or custom), `section` (`A`, `B`, `C` or custom), father's name, mother's name, 10-digit mobile contact, residential address, assigned `routeId` (optional), and admission date.
- **Fee Ledger (`fees[]`)**: Auto-generated `receiptNo` (`REC90001`+), `studentId` (with snapshot of student name & class), `category` (`Tuition`, `Admission`, `Transport`, `Exam`), `feeMonth` (`April`–`March`), `paymentMode` (`Cash`, `UPI`, `Bank`), numeric `amount` (`₹`), and payment date.
- **Transport Routes (`routes[]`)**: Unique `routeId`, route name/area, bus number, numeric `monthlyFare` (`₹`), driver name, and driver contact number.
- **Staff Directory (`staff[]`)**: Auto-generated `staffId` (`STF101`+), full name, designation (`Teacher`, `Admin`, `Support`), mobile contact, qualification, and numeric `monthlySalary` (`₹`).
- **Classes & Sections (`classes[]`)**: Class name (initialized with `Nursery`, `LKG`, `UKG`, `1st`, `2nd`, `3rd`, `4th`, `5th`—0 students enrolled initially), assigned sections (`A`, `B`, `C`), and max section capacity for live occupancy tracking, plus ability to add/remove custom classes and sections.
- **Daily Attendance (`attendanceRecords`)**: Keyed by `YYYY-MM-DD_Class_Section`, storing per-student status (`Present`, `Absent`, `Late`) and remarks, enabling historical lookup and printable daily register sheets.
- **Exam Gradebook (`grades[]`)**: Linked to `studentId` (one updateable/addable exam record per student/term), sanitized numeric scores (`0–100`) for `English`, `Hindi`, `Maths`, and `Science`, computed `total` (`0–400`), `percentage` (`0–100%`), and `passed` boolean (`percentage >= 33` and subject minimums).
- **Digital Notices (`notices[]`)**: Notice ID, title, body text, category (`Academic`, `Holiday`, `Exam`, `Transport`, `General`), author email, and timestamp.

### Interactive Component & State Mapping

- **Form Validation & Sanitization**: Every modal form uses `event.preventDefault()`, trims text inputs, validates required fields and phone/mark ranges (`0 <= marks <= 100`, `amount > 0`), casts all financial and academic figures with `Number()`, and displays inline field errors if invalid.
- **Relational Integrity**: Deleting a student or route prompts an inline confirmation dialog and cleanly handles downstream references; selecting a student with an assigned bus route in the Collect Fee modal can optionally pre-suggest their monthly transport fare when `Transport` category is chosen.
- **Print Document Controller**: Clicking **Print Slip** (Admissions), **Print Receipt** (Fees), **Print Register** (Attendance), or **Print Report Card** (Exams) opens a dedicated A4/Receipt Print Modal displaying the RB Public School crest, document metadata, itemized tables, signature blocks, and a **Print Document** button triggering clean browser printing.
- **Backup, Restore & Reset**: Exporting generates a valid `rb-public-school-backup-YYYY-MM-DD.json` download; importing validates the JSON schema before hydrating all 9 modules; system reset requires explicit confirmation before wiping live records back to zero.
