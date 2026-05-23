# 🧾 CORE-INVOICE — Full Feature App Creation Prompt

## Use this prompt in any AI coding tool (Cursor, Bolt, Lovable, v0, Replit Agent, etc.)

---

## THE PROMPT:

Build a **Vendor Billing Management System** called **"Core-Invoice"** for an industrial site (alumina refinery). The app manages 40+ vendors across 3 departments, generates GST-compliant Tax Invoices, tracks PO budgets, processes logsheets with AI, and handles diesel cost allocation.

---

### 🏗️ TECH STACK
- **Frontend:** React 18 + TypeScript (Single Page Application)
- **Styling:** Tailwind CSS (or inline CSS objects)
- **State:** React useState hooks (no Redux)
- **Backend/Storage:** Firebase Firestore (or Supabase/DynamoDB)
- **AI Integration:** OpenAI GPT-4 / Claude API with function calling (structured tool-use)
- **Auth:** Firebase Auth (email/password)
- **Export:** PDF generation (jsPDF or react-pdf) + CSV export

---

### 📄 PAGES & NAVIGATION

Build these 11 pages with a top horizontal nav bar (dark navy #1a1a2e background):

1. **Login** — Email/password authentication
2. **Register** — New user signup
3. **Dashboard** — KPI stats cards, PO expiry alerts, recent activity, department breakdown
4. **Vendors** — Filterable vendor list (by department, service type) + vendor detail page with 4 tabs:
   - Overview (profile, contact, bank details)
   - PO Tracker (budget utilization %, months remaining, alerts)
   - Bills (all generated invoices for this vendor)
   - Documents (uploaded POs, logsheets, invoices mapped to this vendor)
5. **Tax Invoice Generator** — 5-step wizard:
   - Step 1: Select vendor & service type & month
   - Step 2: Upload/select logsheet (AI extracts KM data)
   - Step 3: Enter billing parameters (diesel price, penalties, rates)
   - Step 4: Auto-calculate bill with full breakdown
   - Step 5: Preview & download generated Tax Invoice + WCR
6. **Diesel Log** — CRUD for diesel purchase entries (date, liters, price/liter, pump name, bill#). Shows weighted average price per month.
7. **Database** — Upload documents (PDF/Excel), AI auto-classifies file type (logsheet/PO/invoice/WCR/e-way bill) and maps to correct vendor
8. **Excel Analyzer** — Upload Excel files, AI maps rows to vendors and extracts billing data
9. **Company Info** — Manage company profile (Bluspring Enterprises Ltd) and vendor profiles (GSTIN, PAN, bank details, address)
10. **Department Detail** — Drill-down view showing all vendors in a department with their billing status
11. **Bill Detail** — View a single generated bill with full calculation breakdown

---

### 📊 DATABASE SCHEMA

**Users Table:** email, name, password_hash

**Vendors Table (40+ records):**
```
id, name, serviceType, vendorCode, department (REFINERY|POWER-ENG|POWER-MMD),
poNumber, poDate, validity
```

**Vendor Profiles Table:**
```
vendorId, vendorName, gstin, pan, address, state, stateCode, pincode,
contactPerson, phone, email, bankName, bankAccountNo, bankIFSC, bankBranch,
gstRegistered (boolean), vendorType (Individual|Firm|Company|LLP),
vehicleNo, seatingCapacity
```

**Billing Records Table:**
```
id, vendorId, vendorName, serviceType, month (e.g. "May'2025"),
poNumber, vendorCode, invoiceNumber, invoiceDate, invReceiptDate,
basicValue, gst, invoiceValue, paymentStatus (Pending|Done|Paid),
deductionAmount, paidAmount, utrDetails, paymentDate, remarks, finalized
```

**Uploaded Documents Table:**
```
id, fileName, fileType (logsheet|po|invoice|wcr|eway|other),
fileSize, uploadedAt, vendorId, vendorName, month, department,
status (processing|mapped|error), extractedData (JSON), summary
```

**Vendor PO Data Table:** Full extracted PO data per vendor

**Vendor Logsheet Table:**
```
vendorId, vendorName, department, serviceType, deviceName, month,
monthStartingKM, monthEndingKM, totalMileage, totalActiveDays,
totalBreakdownDays, dailyLog[{date, startingKM, endingKM, totalMileage, remark}]
```

**Diesel Purchases Table:**
```
id, date, liters, pricePerLiter, totalCost, billNumber, pumpName, addedAt
```

**Company Info Table:** Single record with company GSTIN, PAN, addresses, HSN/SAC codes

**Notifications Table:** Alerts for PO expiry, budget warnings, document processing

---

### 🧮 BILLING CALCULATION ENGINE (Critical Business Logic)

Implement category-specific billing formulas:

**Service Category Classification** (regex-based, first match wins):
1. `/200\s*t|100\s*t|40\s*t|crane/i` → **crane**
2. `/palfinger|hydra|forklift|trailer/i` → **palfinger_hydra**
3. `/bus/i` → **bus**
4. `/camper/i` → **camper_fixed** (fixed monthly)
5. `/bolero|scorpio|xylo|tipper/i` → **vehicle**
6. `/food|meal|hotel|hospitality|catering/i` → **food**
7. `/guest\s*house\s*rent|house\s*rent|rent/i` → **rent**
8. `/guest\s*house\s*elect|electricity/i` → **guest_electricity**
9. `/house\s*keeping|housekeeping|manpower\s*supply/i` → **housekeeping**
10. `/cmms|it\s*service|software/i` → **it_cmms**
11. `/shutdown|project\s*work/i` → **manpower_shutdown**
12. `/consultancy|scientific|technical/i` → **consultancy**
13. Default → **other**

**Formulas:**

| Category | Formula |
|----------|---------|
| **Bus/Vehicle** | dieselLiters = totalKM / mileageRate; dieselCost = liters × avgDieselPrice; subTotal = monthlyHire - penalty + dieselCost; GST 18% |
| **Camper (Fixed)** | subTotal = monthlyHire - penalty (all-inclusive, no diesel calc); GST 18% |
| **Crane** | dieselLiters = totalHours × dieselPerHour; + nonAvailPenalty (₹1500/hr); subTotal = monthlyHire + dieselCost - penalties; IGST 18% |
| **Palfinger/Hydra** | operatingDiesel + vehicleMovementDiesel + trailerDiesel; subTotal = hire + all diesel costs - penalty |
| **Food** | subTotal = totalMeals × mealCost (₹65/plate) - penalty; GST 5% (CGST 2.5% + SGST 2.5%) |
| **Housekeeping** | subTotal = (mandays × rate ₹880) + (supervisor × ₹950) + (workers × ₹500 allowance) - penalty; GST 18% |
| **IT/CMMS** | subTotal = months × ₹27,500/month - penalty; GST 18% |
| **Shutdown Manpower** | base = mandays × rate; subTotal = base × (1 + 15% margin) - penalty; GST 18% |
| **Guest House Rent** | subTotal = fixedRent - penalty (GST inclusive per PO) |
| **Guest House Electricity** | subTotal = actual bill amount - penalty |

**GST Logic:**
- Supplier stateCode === "21" (Odisha) → CGST 9% + SGST 9%
- Supplier stateCode !== "21" → IGST 18%
- Food category → CGST 2.5% + SGST 2.5%
- Unregistered vendor → No GST

**Diesel Price:** Use weighted average from Diesel Log: totalCost / totalLiters for the billing month

---

### 🤖 AI FEATURES (6 AI-powered tools using function calling)

1. **PO Data Extraction** — Upload PO PDF → AI extracts all fields (purchaser, supplier GSTIN, line items, HSN/SAC, amounts, validity dates)
2. **Document Classification** — Upload any file → AI detects type (logsheet/PO/invoice/WCR/eway) and maps to correct vendor from the 40+ vendor list
3. **Logsheet Vendor Mapping** — Upload monthly logsheet Excel → AI identifies which rows belong to which vendor, extracts total KM and active days
4. **Daily Log Generation** — Given total KM for a month, AI generates realistic day-by-day odometer readings (continuous, ±20% daily variation, breakdown days = 0)
5. **KM Extraction** — From uploaded logsheet, extract starting KM, closing KM, total KM, active days with confidence score
6. **Excel Row Mapping** — Map spreadsheet rows to vendor billing attributes (KM, diesel, hire, penalties, meals, mandays)

---

### 🧾 TAX INVOICE FORMAT (Generated Document)

The generated invoice must include:
1. Header: "TAX INVOICE" + "Original Invoice"
2. Vendor Details: Name, Address, GSTIN, Place of Supply
3. Invoice Number, Date, PO Number, Vehicle Number
4. Billed To: Company name, GSTIN 21AAMCB3236E1Z5
5. Consignee: UAIL site address
6. Service Details Table: Line items with HSN/SAC, Qty, Rate, Taxable Value
7. GST Calculation: CGST + SGST or IGST breakdown
8. Grand Total + Amount in Indian Words (Lakh/Crore format, ending with "Only")
9. KM Odometer Tracking (for vehicles): Starting → Closing = Total
10. Diesel Calculation: Step-by-step formula shown
11. Numbered Calculation Breakdown
12. Declaration & Signature Block

**WCR (Work Completion Report) format:**
- Document Ref: QHSE-AC-F-0002-5, Rev 4
- Date, Site, Location, Client, Vendor, PO details
- Invoice reference, value, amount in words
- Work completion summary
- Signature chain: Initiator → Dept Head → Stores → Site Manager → Regional Manager

---

### 📐 PO BUDGET TRACKING

For each vendor, calculate:
- `utilizationPct = (totalBilled / totalPoValue) × 100`
- `remaining = totalPoValue - totalBilled`
- `avgMonthlyBurn = totalBilled / monthsBilled`
- `monthsOfBudgetLeft = remaining / avgMonthlyBurn`

Alert thresholds: ≥80% warning (yellow), ≥95% critical (red), ≥100% exhausted

PO Validity: Calculate days remaining, alert if <30 days or expired

---

### 🎨 UI DESIGN

- **Color Palette:** Primary #4fc3f7, Nav #1a1a2e, Success #66bb6a, Warning #ff9800, Error #ef5350, Purple #6a1b9a
- **Cards:** White, borderRadius 12px, subtle shadow
- **Department Badges:** REFINERY (#e3f2fd/#1565c0), POWER-ENG (#fce4ec/#c62828), POWER-MMD (#f3e5f5/#6a1b9a)
- **Tables:** Compact, fontSize 13, striped rows
- **Buttons:** Light blue background, dark text, rounded 8px
- **Monetary Display:** Indian format ₹1,23,456.78 with commas at thousands/lakhs/crores

---

### 🔢 UTILITY FUNCTIONS

1. **numToWords(amount)** — Convert number to Indian English words (Lakh/Crore system). Example: 1234567.89 → "Rupees Twelve Lakh Thirty Four Thousand Five Hundred and Sixty Seven and Eighty Nine Paise Only"

2. **normalizeMonth(raw)** — Parse any month format to "MMM'YYYY". Handles: "May'2025", "may-2025", "2025-05", "05/2025", "0525", etc.

3. **classifyService(serviceType)** — Regex-based category detection (14 categories)

4. **formatIndianCurrency(amount)** — Format number with Indian comma placement

---

### 📋 SAMPLE VENDOR DATA (Pre-load 40+ vendors)

3 Departments: REFINERY, POWER-ENG, POWER-MMD

Examples:
- Nazarene Travels | Bus - 42 Seater | REFINERY | Code: 50171 | PO: 4200013618
- Joseph Bhatra | Bus - UAIL Electrical | REFINERY | Code: 50002
- Jagannath Bhatra | Bolero | REFINERY | Code: 50095
- Sai Samrat Crane | 200T Crane | REFINERY | Code: 50445
- Logistic Enterprises | 40T Crane | REFINERY (Inter-state, Maharashtra)
- M/s Hotel Samrat | Food & Catering | POWER-ENG | Code: 50301
- Hofincons (HK) | House Keeping | REFINERY | Code: 50015
- Maintwiz | IT/CMMS | POWER-MMD
- United Eco Care | Consultancy | REFINERY

**Company Info (Billed To):**
- Name: Bluspring Enterprises Limited (formerly Quess/Hofincons)
- GSTIN: 21AAMCB3236E1Z5 | PAN: AAMCB3236E
- State: Odisha (Code 21)
- Site: C/O-UAIL, AT-DORAGUDA, PO-KUCHEIPADAR, DIST-RAYAGADA, PIN 765015
- HSN/SAC: Vehicle=996412/840999, Food=996339/996600, Service=998511

---

### ⚠️ CRITICAL IMPLEMENTATION RULES

1. All monetary values use **Indian numbering** (Lakh/Crore, NOT Million/Billion)
2. Month format is ALWAYS "MMM'YYYY" (e.g. "May'2025")
3. GST is state-code based (21=Odisha=intra-state, others=inter-state)
4. AI uses **structured function calling** (tool-use), NOT free-text responses
5. PO budget alerts are real-time on dashboard
6. Diesel price is auto-fetched from Diesel Log (weighted average for the month)
7. Tax Invoice must be downloadable as PDF
8. File uploads support: PDF, Excel (.xlsx/.xls), CSV, images
9. Storage limit: 350KB per document record (strip binary data if larger)
10. All dates in Indian format (DD/MM/YYYY)

---

Build this complete application with all features functional. Start with the database schema, then build the UI pages, then integrate the billing engine, and finally add AI features.
