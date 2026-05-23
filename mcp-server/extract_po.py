#!/usr/bin/env python3
"""
PO PDF Extractor — tuned for Bluspring Enterprises PO format.
Extracts all billing-relevant data from Purchase Order PDFs.
"""

import sys
import json
import re
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print(json.dumps({"error": "pdfplumber not installed"}))
    sys.exit(0)

GSTIN_PATTERN = re.compile(r'\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[A-Z\d]{1}[A-Z\d]{1}')
PAN_PATTERN = re.compile(r'[A-Z]{5}\d{4}[A-Z]{1}')
MSME_PATTERN = re.compile(r'(UDYAM-[A-Z]{2}-\d{2}-\d{7})')


def clean(val):
    if not val:
        return ""
    return val.strip().replace('\n', ' ').strip()


def parse_amount(value):
    if not value:
        return 0.0
    cleaned = re.sub(r'[₹,\s]', '', str(value))
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def extract_between(text, start_pattern, end_pattern, flags=re.IGNORECASE | re.DOTALL):
    match = re.search(f'{start_pattern}(.*?){end_pattern}', text, flags)
    return clean(match.group(1)) if match else ""


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: extract_po.py <pdf_path>"}))
        return

    pdf_path = sys.argv[1]
    if not Path(pdf_path).exists():
        print(json.dumps({"error": f"File not found: {pdf_path}"}))
        return

    # Extract all text
    text = ""
    tables = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
                page_tables = page.extract_tables()
                if page_tables:
                    tables.extend(page_tables)
    except Exception as e:
        print(json.dumps({"error": f"Failed to read PDF: {str(e)}"}))
        return

    if not text.strip():
        print(json.dumps({"error": "No text extracted. PDF may be scanned/image-based."}))
        return

    # ===== PURCHASER (BILL TO) =====
    bill_to_name = ""
    bill_to_address = ""
    bill_to_match = re.search(r'Name and Address of Purchaser\(Bill To\)\s*\n(.+?)(?=City|Purchase Order|Ship To)', text, re.DOTALL | re.IGNORECASE)
    if bill_to_match:
        lines = [l.strip() for l in bill_to_match.group(1).strip().split('\n') if l.strip()]
        bill_to_name = lines[0] if lines else ""
        bill_to_address = ', '.join(lines[1:]) if len(lines) > 1 else ""

    # City, Pincode, State from Bill To section
    bill_to_city = extract_between(text, r'City\s*:', r'\n')
    bill_to_pincode = extract_between(text, r'Pincode\s*:', r'\n')
    bill_to_state = extract_between(text, r'State\s*:', r'\n')
    if bill_to_city:
        bill_to_address += f", {bill_to_city}" if bill_to_address else bill_to_city
    if bill_to_pincode:
        bill_to_address += f" - {bill_to_pincode}"
    if bill_to_state:
        bill_to_address += f", {bill_to_state}"

    # ===== PURCHASER GSTIN =====
    purchaser_gstin = ""
    gstin_matches = GSTIN_PATTERN.findall(text)
    if gstin_matches:
        purchaser_gstin = gstin_matches[0]

    # ===== PURCHASE ORDER NUMBER & DATE =====
    po_number = ""
    order_date = ""

    # Pattern: "Purchase Order Order Date..." then next line has "... 4200013616 13/05/2026"
    # The PO number (10 digits) appears on the line after the header
    po_line_match = re.search(r'Purchase Order\s+Order Date.*?\n.*?(\d{10})\s+(\d{2}/\d{2}/\d{4})', text)
    if po_line_match:
        po_number = po_line_match.group(1)
        order_date = po_line_match.group(2)

    # Fallback: find any 10-digit number near "Purchase Order"
    if not po_number:
        po_match = re.search(r'(\d{10})\s+\d{2}/\d{2}/\d{4}', text)
        if po_match:
            po_number = po_match.group(1)

    # Fallback: Annexure reference
    if not po_number:
        ann_match = re.search(r'Annexure for PO No:\s*(\d+)', text)
        if ann_match:
            po_number = ann_match.group(1)

    # Order date fallback
    if not order_date:
        date_match = re.search(r'(\d{2}/\d{2}/\d{4})', text)
        if date_match:
            order_date = date_match.group(1)

    # ===== SHIP TO =====
    ship_to = ""
    ship_match = re.search(r'Ship To\s*:?\s*\n(.+?)(?=GSTIN|Supplier|ERP)', text, re.DOTALL)
    if ship_match:
        ship_to = ' '.join([l.strip() for l in ship_match.group(1).strip().split('\n') if l.strip()])

    # ===== SUPPLIER DETAILS =====
    supplier_code = ""
    sc_match = re.search(r'Supplier Code\s*:?\s*(\d{10})', text)
    if sc_match:
        supplier_code = sc_match.group(1)

    supplier_name = ""
    # In this format, supplier name appears a couple lines after Supplier Code
    # Look for a proper name (capitalized words, not keywords)
    sup_section = ""
    sup_idx = text.find('Supplier Code')
    if sup_idx >= 0:
        sup_section = text[sup_idx:sup_idx+500]
        # Find lines that look like a name (not ERP/PO/WBS keywords)
        for line in sup_section.split('\n')[1:8]:
            line = line.strip()
            # Skip lines with keywords
            if re.search(r'(ERP|PO Number|WBS|Freight|Requested|Buyer|GSTIN|Contact|Email|PAN|MSME|Service Start|Service End)', line, re.IGNORECASE):
                continue
            if re.search(r'^\d{6}', line):  # pincode line
                continue
            if line == 'date':
                continue
            # A name line: starts with capital, has 2+ words, no long numbers
            if re.match(r'^[A-Z][a-zA-Z\s\.]+$', line) and len(line) > 3 and len(line) < 50:
                supplier_name = line
                break
            # Also match "A K Engineering Works" style
            if re.match(r'^[A-Z][A-Za-z\s\.&]+$', line) and len(line) > 5:
                supplier_name = line
                break

    # Fallback: from scope/annexure
    if not supplier_name:
        scope_name = re.search(r'contractor[s]?\s*\((.+?)\)', text, re.IGNORECASE)
        if scope_name:
            supplier_name = clean(scope_name.group(1))

    supplier_address = ""
    if supplier_name and sup_section:
        # Address is lines after name until GSTIN/pincode
        name_idx = sup_section.find(supplier_name)
        if name_idx >= 0:
            after_name = sup_section[name_idx + len(supplier_name):name_idx + len(supplier_name) + 200]
            addr_lines = []
            for line in after_name.split('\n')[:4]:
                line = line.strip()
                if re.search(r'(GSTIN|Contact|Email|PAN|MSME|Requested|ERP)', line, re.IGNORECASE):
                    break
                if line and len(line) > 3:
                    addr_lines.append(line)
            supplier_address = ', '.join(addr_lines)

    # Supplier GSTIN (second GSTIN in document, after purchaser's)
    supplier_gstin = gstin_matches[2] if len(gstin_matches) > 2 else (gstin_matches[1] if len(gstin_matches) > 1 else "")

    # Contact details
    contact_person = extract_between(text, r'Contact Person\s*:', r'\n')
    contact_number = extract_between(text, r'Contact number\s*:', r'\n')
    email_id = extract_between(text, r'Email Id\s*:', r'\n')

    # PAN & MSME
    pans = PAN_PATTERN.findall(text)
    supplier_pan = ""
    pan_match = re.search(r'PAN\s*:\s*([A-Z]{5}\d{4}[A-Z])', text)
    if pan_match:
        supplier_pan = pan_match.group(1)

    msme_matches = MSME_PATTERN.findall(text)
    msme_number = msme_matches[0] if msme_matches else ""

    # ===== SERVICE DATES =====
    service_start = extract_between(text, r'Service Start Date', r'\n')
    service_end = extract_between(text, r'Service End Date', r'\n')
    # Also check Contract Period
    contract_match = re.search(r'Contract Period.*?(\d{2}\.\d{2}\.\d{4})\s*to\s*(\d{2}\.\d{2}\.\d{4})', text, re.IGNORECASE)
    if contract_match:
        if not service_start:
            service_start = contract_match.group(1)
        if not service_end:
            service_end = contract_match.group(2)

    # ===== ERP FIELDS =====
    erp_pr_number = extract_between(text, r'ERP PR Number\s*\n', r'\n')
    if not erp_pr_number:
        erp_pr_match = re.search(r'(PRSR\d+)', text)
        erp_pr_number = erp_pr_match.group(1) if erp_pr_match else ""

    erp_pr_type = extract_between(text, r'ERP PR Type\s*\n', r'\n')
    if not erp_pr_type:
        erp_pr_type = "Service" if "Service" in text[:2000] else ""

    erp_po_number = ""
    erp_po_match = re.search(r'ERP PO Number\s*\n\s*(POSR\d+)', text)
    if erp_po_match:
        erp_po_number = erp_po_match.group(1)
    else:
        erp_po_match = re.search(r'(POSR\d+)', text)
        erp_po_number = erp_po_match.group(1) if erp_po_match else ""

    wbs_id = ""
    wbs_match = re.search(r'WBS ID.*?\n\s*(.+?)(?:\n|Freight)', text)
    if wbs_match:
        wbs_id = clean(wbs_match.group(1))

    payment_terms = ""
    pt_match = re.search(r'Payment Terms:\s*\n?\s*(.+?)(?:\n|ERP)', text)
    if pt_match:
        payment_terms = clean(pt_match.group(1))
    if not payment_terms:
        pt_match = re.search(r'(\d+ days from invoice\s*(?:date|submission))', text, re.IGNORECASE)
        if pt_match:
            payment_terms = clean(pt_match.group(1))

    expected_delivery = ""
    ed_match = re.search(r'Expected Delivery\s*\n?\s*(\d{2}/\d{2}/\d{4})', text)
    if ed_match:
        expected_delivery = ed_match.group(1)

    requested_type = ""
    rt_match = re.search(r'Requested Type:\s*\n?\s*(.+?)(?:\n|Buyer)', text)
    if rt_match:
        requested_type = clean(rt_match.group(1))
    if not requested_type and 'Billable' in text:
        requested_type = "Billable"

    # ===== LINE ITEMS =====
    line_items = []
    # Look for the structured table with SN, HSN/SAC, Item Code, etc.
    for table in tables:
        if not table or len(table) < 2:
            continue
        # Find header row containing 'HSN' or 'Item Description'
        header_idx = -1
        for i, row in enumerate(table):
            row_str = ' '.join(str(c or '') for c in row).lower()
            if 'hsn' in row_str and ('item' in row_str or 'description' in row_str):
                header_idx = i
                break
        if header_idx < 0:
            continue

        header = table[header_idx]
        # Sometimes header spans 2 rows (Unit Rate INR, Discount % Amt, etc.)
        # Skip sub-header row
        data_start = header_idx + 1
        if data_start < len(table):
            first_data = table[data_start]
            first_str = ' '.join(str(c or '') for c in first_data).lower()
            if 'inr' in first_str or '%' in first_str:
                data_start += 1

        for row in table[data_start:]:
            if not row or all(not c for c in row):
                continue
            cells = [str(c or '').strip() for c in row]
            # Skip summary rows
            joined = ' '.join(cells).lower()
            if 'basic value' in joined or 'cost breakup' in joined or 'cgst' in joined or 'sgst' in joined or 'total' in joined or 'advance' in joined or 'amount chargable' in joined:
                continue

            # Try to parse line item - handle variable column counts
            try:
                sn = cells[0] if cells[0].isdigit() else ""
                if not sn:
                    continue

                # Find the amount (last numeric value in row)
                amounts_in_row = []
                for ci, c in enumerate(cells):
                    v = parse_amount(c)
                    if v > 0:
                        amounts_in_row.append((ci, v))

                hsn_sac = cells[1] if len(cells) > 1 else ""
                item_code = cells[2] if len(cells) > 2 else ""
                description = cells[3] if len(cells) > 3 else ""
                uom = cells[4] if len(cells) > 4 else ""
                qty = parse_amount(cells[5]) if len(cells) > 5 else 0
                unit_rate = parse_amount(cells[6]) if len(cells) > 6 else 0

                # The last big number is the total amount for this line
                amount = amounts_in_row[-1][1] if amounts_in_row else 0
                # Basic amount is typically qty * unit_rate
                basic_amt = qty * unit_rate if qty and unit_rate else 0
                # GST amounts
                cgst_pct = 9.0  # Default for intra-state
                sgst_pct = 9.0
                cgst_amt = basic_amt * 0.09
                sgst_amt = basic_amt * 0.09

                if not amount:
                    amount = basic_amt + cgst_amt + sgst_amt

                line_items.append({
                    "sn": int(sn),
                    "hsnSac": hsn_sac,
                    "itemCode": item_code,
                    "itemDescription": description.replace('\n', ' '),
                    "uom": uom,
                    "quantity": qty,
                    "unitRate": unit_rate,
                    "discountPct": 0,
                    "discountAmt": 0,
                    "basicAmount": basic_amt,
                    "cgstPct": cgst_pct,
                    "cgstAmt": round(cgst_amt, 2),
                    "sgstPct": sgst_pct,
                    "sgstAmt": round(sgst_amt, 2),
                    "amount": round(amount, 2),
                })
            except (ValueError, IndexError):
                continue

    # ===== AMOUNTS =====
    base_value = parse_amount(extract_between(text, r'(?:Basic Value|Base Value)\s*:', r'\n'))
    cgst_total = parse_amount(extract_between(text, r'CGST\s*:', r'\n'))
    sgst_total = parse_amount(extract_between(text, r'SGST\s*:', r'\n'))
    total_amount = parse_amount(extract_between(text, r'Total Amount\s*:', r'\n'))
    advance_payable = extract_between(text, r'Advance Payble\s*:', r'\n')

    amount_in_words = ""
    words_match = re.search(r'Amount Chargable \(In Words\)\s*:?\s*(.+?)(?:\n|$)', text)
    if words_match:
        amount_in_words = clean(words_match.group(1))

    # ===== INVOICE DOCUMENTATION REQUIREMENTS =====
    invoice_requirements = ""
    inv_req_match = re.search(r'Invoice Documentation Requirements:\s*\n((?:\d+\s+.+\n?)+)', text)
    if inv_req_match:
        invoice_requirements = clean(inv_req_match.group(1))

    # ===== DIESEL TERMS (from annexure) =====
    diesel_terms = ""
    diesel_match = re.search(r'Diesel.*?(?:Hydra.*?Trailer.*?Forklift|@\d+Ltr).+', text, re.IGNORECASE | re.DOTALL)
    if diesel_match:
        diesel_terms = clean(diesel_match.group(0)[:300])

    # ===== SCOPE OF WORK =====
    scope = ""
    scope_match = re.search(r'SCOPE OF WORK:\s*\n(.+?)(?:\n\s*\d+\.\s|\n\s*3\.)', text, re.DOTALL)
    if scope_match:
        scope = clean(scope_match.group(1))

    # ===== BUILD RESULT =====
    # Classify line items into fixed hire vs diesel variable
    hire_items = []
    diesel_items = []
    for li in line_items:
        item_code = li.get("itemCode", "")
        desc = li.get("itemDescription", "").lower()
        # Diesel item codes: 9000448 (MHE), 9000054 (Transport)
        if item_code in ("9000448", "9000054") or "diesel" in desc:
            diesel_items.append(li)
        else:
            hire_items.append(li)

    # Extract diesel rate from diesel line items or text
    diesel_rate = 0
    for di in diesel_items:
        if di.get("unitRate", 0) > 0:
            diesel_rate = di["unitRate"]
            break
    if not diesel_rate:
        dr_match = re.search(r'(?:diesel|fuel)\s*(?:rate|price|cost)?\s*[:\-@]?\s*(?:Rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(?:/?\s*(?:ltr|litre|l))', text, re.IGNORECASE)
        if dr_match:
            diesel_rate = float(dr_match.group(1))
        elif diesel_items:
            diesel_rate = 95  # Default as per PO standard

    # Max PO quantity and value for hire items
    max_po_qty = sum(li.get("quantity", 0) for li in hire_items)
    max_po_value = sum(li.get("basicAmount", 0) or (li.get("quantity", 0) * li.get("unitRate", 0)) for li in hire_items)
    max_diesel_qty = sum(li.get("quantity", 0) for li in diesel_items)

    # Determine GST status
    gst_status = "unknown"
    gst_type = "CGST_SGST"  # default intrastate
    gst_rate = 18
    if supplier_gstin and len(supplier_gstin) == 15:
        vendor_state_code = supplier_gstin[:2]
        purchaser_state_code = purchaser_gstin[:2] if purchaser_gstin else "21"
        if vendor_state_code != purchaser_state_code:
            gst_type = "IGST"
        gst_status = "registered"
    elif "gst declaration" in text.lower() or "unregistered" in text.lower():
        gst_status = "unregistered"
        gst_type = "NO_GST"
        gst_rate = 0
    # Check from line items GST
    if line_items:
        first_cgst = line_items[0].get("cgstPct", 0)
        first_sgst = line_items[0].get("sgstPct", 0)
        if first_cgst == 0 and first_sgst == 0:
            gst_rate = 0
            gst_type = "NO_GST"

    # Classify service category
    service_category = "other"
    all_desc = ' '.join(li.get("itemDescription", "") for li in line_items).lower()
    if any(w in all_desc for w in ["crane", "hydra", "palfinger", "mhe", "sany"]):
        service_category = "mhe_crane"
    elif any(w in all_desc for w in ["bus", "seater", "transport", "vehicle", "hiring", "camper", "bolero", "utility"]):
        service_category = "transport"
    elif any(w in all_desc for w in ["labour", "labor", "manpower", "unskilled", "supervisor", "mandays"]):
        service_category = "labour"
    elif any(w in all_desc for w in ["licence", "license", "subscription", "software", "cmms", "inspection", "pipeline"]):
        service_category = "technology"

    # Determine what's auto-fetchable vs manual for billing
    auto_fetchable = {
        "poNumber": po_number,
        "vendorName": supplier_name,
        "vendorAddress": supplier_address,
        "vendorGstin": supplier_gstin,
        "vendorPan": supplier_pan,
        "msmeNumber": msme_number,
        "supplierCode": supplier_code,
        "hsnSacCodes": [li.get("hsnSac") for li in hire_items if li.get("hsnSac")],
        "itemCodes": [li.get("itemCode") for li in hire_items if li.get("itemCode")],
        "itemDescriptions": [li.get("itemDescription") for li in hire_items if li.get("itemDescription")],
        "uom": hire_items[0].get("uom", "AU") if hire_items else "AU",
        "unitRate": hire_items[0].get("unitRate", 0) if hire_items else 0,
        "maxPoQty": max_po_qty,
        "maxPoValue": max_po_value,
        "maxDieselQty": max_diesel_qty,
        "dieselRate": diesel_rate,
        "gstType": gst_type,
        "gstRate": gst_rate,
        "gstStatus": gst_status,
        "purchaserName": bill_to_name or "Bluspring Enterprises Limited",
        "purchaserGstin": purchaser_gstin or "21AAMCB3236E1Z5",
        "purchaserAddress": bill_to_address,
        "shipToAddress": ship_to,
        "wbsId": wbs_id,
        "serviceStartDate": service_start,
        "serviceEndDate": service_end,
        "paymentTerms": payment_terms,
        "serviceCategory": service_category,
    }

    manual_required = []
    manual_required.append({"field": "invoiceNumber", "label": "Invoice Number", "reason": "Vendor generates at billing"})
    manual_required.append({"field": "invoiceDate", "label": "Invoice Date", "reason": "Date of bill raising"})
    manual_required.append({"field": "billingPeriod", "label": "Billing Period (From-To)", "reason": "Specific month billed"})
    manual_required.append({"field": "runningBillNo", "label": "Running Bill Number", "reason": "Sequential (1st, 2nd...)"})
    if service_category in ("mhe_crane", "transport"):
        manual_required.append({"field": "actualDays", "label": "Actual Days/Trips", "reason": "Real usage this period"})
        manual_required.append({"field": "actualDieselLitres", "label": "Actual Diesel (Litres)", "reason": "Variable consumption"})
        manual_required.append({"field": "logsheet", "label": "Logsheet / Trip Details", "reason": "Operating record"})
    elif service_category == "labour":
        manual_required.append({"field": "actualMandays", "label": "Attendance / Mandays", "reason": "Actual labour present"})
        manual_required.append({"field": "musterRoll", "label": "Muster Roll Reference", "reason": "Attendance proof"})
    manual_required.append({"field": "wcr", "label": "Work Completion Report", "reason": "Service proof"})
    manual_required.append({"field": "deductions", "label": "Deductions / Penalties", "reason": "If applicable"})

    result = {
        "purchaseOrderNumber": po_number,
        "orderDate": order_date,
        "billToName": bill_to_name,
        "billToAddress": bill_to_address,
        "purchaserGstin": purchaser_gstin,
        "shipToAddress": ship_to,
        "supplierName": supplier_name,
        "supplierCode": supplier_code,
        "supplierAddress": supplier_address,
        "vendorGstin": supplier_gstin,
        "vendorPan": supplier_pan,
        "msmeNumber": msme_number,
        "contactPerson": contact_person,
        "contactNumber": contact_number,
        "emailId": email_id,
        "serviceStartDate": service_start,
        "serviceEndDate": service_end,
        "erpPrNumber": erp_pr_number,
        "erpPrType": erp_pr_type,
        "erpPoNumber": erp_po_number,
        "wbsId": wbs_id,
        "paymentTerms": payment_terms,
        "requestedType": requested_type,
        "expectedDelivery": expected_delivery,
        "lineItems": line_items,
        "hireItems": hire_items,
        "dieselItems": diesel_items,
        "baseValue": base_value,
        "cgstTotal": cgst_total,
        "sgstTotal": sgst_total,
        "totalAmount": total_amount,
        "advancePayable": advance_payable,
        "amountInWords": amount_in_words,
        "invoiceRequirements": invoice_requirements,
        "dieselTerms": diesel_terms,
        "dieselRate": diesel_rate,
        "scopeOfWork": scope,
        # New fields for bill generation
        "serviceCategory": service_category,
        "gstStatus": gst_status,
        "gstType": gst_type,
        "gstRate": gst_rate,
        "maxPoQty": max_po_qty,
        "maxPoValue": max_po_value,
        "maxDieselQty": max_diesel_qty,
        "autoFetchable": auto_fetchable,
        "manualRequired": manual_required,
    }

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
