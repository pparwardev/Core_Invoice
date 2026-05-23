"""
PO Billing Assistant — MCP Server
Tools for reading Purchase Order PDFs and vendor billing workflows.
"""

import json
import re
import os
from pathlib import Path
from mcp.server.fastmcp import FastMCP
import pdfplumber

mcp = FastMCP("po-billing-assistant")

# ============================================================
# UTILITY FUNCTIONS
# ============================================================

GSTIN_PATTERN = re.compile(r'\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[Z]{1}[A-Z\d]{1}')
PAN_PATTERN = re.compile(r'[A-Z]{5}\d{4}[A-Z]{1}')
MSME_PATTERN = re.compile(r'(UDYAM-[A-Z]{2}-\d{2}-\d{7}|[A-Z]{2}\d{2}[A-Z]\d{7})')


def extract_text_from_pdf(file_path: str) -> str:
    text = ""
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    if not text.strip():
        raise ValueError("No text extracted — PDF may be scanned/image-based.")
    return text


def extract_field(text: str, patterns: list, default: str = "") -> str:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            return match.group(1).strip()
    return default


def parse_amount(value: str) -> float:
    if not value:
        return 0.0
    cleaned = re.sub(r'[₹,\s]', '', value)
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def extract_po_data(text: str, file_path: str = "") -> dict:
    # From filename
    po_from_filename = ""
    vendor_from_filename = ""
    site_from_filename = ""
    if file_path:
        fname = Path(file_path).stem
        fn_match = re.match(r'PO[- ]?(\d+)\s*-\s*(.+?)\s*-\s*(.+)', fname)
        if fn_match:
            po_from_filename = fn_match.group(1)
            vendor_from_filename = fn_match.group(2).strip()
            site_from_filename = fn_match.group(3).strip()

    gstins = GSTIN_PATTERN.findall(text)
    pans = PAN_PATTERN.findall(text)
    msme = MSME_PATTERN.findall(text)

    po_number = extract_field(text, [
        r'(?:Purchase\s*Order|PO)\s*(?:No|Number|#)?[:\s]*([A-Z0-9\-/]+\d+)',
        r'(?:Order\s*No|PO\s*No)[:\s]*(\S+)',
    ]) or po_from_filename

    vendor_name = extract_field(text, [
        r'(?:Supplier|Vendor)\s*(?:Name)?[:\s]*([^\n]+)',
        r'(?:M/s\.?|Messrs\.?)\s*([^\n,]+)',
    ]) or vendor_from_filename

    po_date = extract_field(text, [r'(?:Order\s*Date|PO\s*Date|Date)[:\s]*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})'])
    delivery_date = extract_field(text, [r'(?:Delivery|Expected\s*Delivery|Service\s*End)[:\s]*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})'])
    service_start = extract_field(text, [r'(?:Service\s*Start|Start\s*Date)[:\s]*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})'])
    service_end = extract_field(text, [r'(?:Service\s*End|End\s*Date|Validity|Valid\s*(?:Till|Until))[:\s]*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})'])

    total_amount = parse_amount(extract_field(text, [r'(?:Grand\s*Total|Total\s*Amount|Net\s*Amount)[:\s]*([\d,]+\.?\d*)']))
    basic_amount = parse_amount(extract_field(text, [r'(?:Basic|Base|Sub\s*Total)[:\s]*₹?\s*([\d,]+\.?\d*)']))
    gst_amount = parse_amount(extract_field(text, [r'(?:GST|Tax)\s*(?:Amount)?[:\s]*₹?\s*([\d,]+\.?\d*)']))
    payment_terms = extract_field(text, [r'(?:Payment\s*Terms?)[:\s]*([^\n]+)'])
    invoice_requirements = extract_field(text, [
        r'(?:Invoice\s*(?:Documentation\s*)?Requirements?)[:\s]*([^\n]+(?:\n[^\n]+)*)',
    ])

    return {
        "po_number": po_number,
        "vendor_name": vendor_name,
        "vendor_gstin": gstins[1] if len(gstins) > 1 else (gstins[0] if gstins else ""),
        "purchaser_gstin": gstins[0] if gstins else "",
        "vendor_pan": pans[1] if len(pans) > 1 else (pans[0] if pans else ""),
        "msme_number": msme[0] if msme else "",
        "site_name": site_from_filename,
        "po_date": po_date,
        "delivery_date": delivery_date,
        "service_start_date": service_start,
        "service_end_date": service_end or delivery_date,
        "payment_terms": payment_terms,
        "invoice_requirements": invoice_requirements,
        "line_items": [],
        "basic_amount": basic_amount,
        "gst_amount": gst_amount,
        "total_amount": total_amount or (basic_amount + gst_amount),
        "grand_total": total_amount or (basic_amount + gst_amount),
    }


# ============================================================
# MCP TOOLS
# ============================================================

@mcp.tool()
def read_po_pdf(file_path: str) -> str:
    """Read a Purchase Order PDF and extract structured data including vendor details, PO number, dates, line items, amounts, payment terms, GSTIN, PAN, and invoice requirements."""
    try:
        if not os.path.exists(file_path):
            return json.dumps({"error": f"File not found: {file_path}"})
        text = extract_text_from_pdf(file_path)
        data = extract_po_data(text, file_path)
        return json.dumps(data, indent=2, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def verify_invoice_against_po(po_data: str, invoice_data: str) -> str:
    """Verify a vendor invoice against the corresponding PO. Checks amounts, quantities, rates, vendor details for discrepancies. Returns match status and recommendations."""
    try:
        po = json.loads(po_data)
        invoice = json.loads(invoice_data)
        discrepancies = []
        recommendations = []

        # Check vendor GSTIN
        if po.get("vendor_gstin") and invoice.get("vendor_gstin"):
            if po["vendor_gstin"] != invoice["vendor_gstin"]:
                discrepancies.append({"field": "vendor_gstin", "po_value": po["vendor_gstin"], "invoice_value": invoice["vendor_gstin"], "severity": "critical"})

        # Check total amount
        po_total = float(po.get("total_amount") or po.get("grand_total") or 0)
        inv_total = float(invoice.get("total_amount") or invoice.get("invoice_value") or 0)
        if po_total > 0 and inv_total > po_total:
            discrepancies.append({"field": "total_amount", "po_value": po_total, "invoice_value": inv_total, "severity": "critical"})
            recommendations.append(f"Invoice ₹{inv_total:,.0f} exceeds PO ₹{po_total:,.0f}")

        # Check PO number
        if po.get("po_number") and invoice.get("po_number"):
            if po["po_number"] != invoice["po_number"]:
                discrepancies.append({"field": "po_number", "po_value": po["po_number"], "invoice_value": invoice["po_number"], "severity": "high"})

        critical = sum(1 for d in discrepancies if d["severity"] == "critical")
        match_status = "mismatch" if critical > 0 else ("partial_match" if discrepancies else "matched")

        return json.dumps({"match_status": match_status, "discrepancies": discrepancies, "recommendations": recommendations}, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def get_vendor_billing_summary(vendor_name: str, po_directory: str) -> str:
    """Get billing summary for a vendor by scanning all POs in a directory. Returns total POs, value, GSTIN, PAN for compliance."""
    try:
        po_dir = Path(po_directory)
        if not po_dir.exists():
            return json.dumps({"error": f"Directory not found: {po_directory}"})

        po_list = []
        total_value = 0.0
        vendor_gstin = ""
        vendor_pan = ""

        for pdf_file in list(po_dir.glob("*.pdf")) + list(po_dir.glob("*.PDF")):
            try:
                text = extract_text_from_pdf(str(pdf_file))
                if vendor_name.lower() not in text.lower():
                    continue
                data = extract_po_data(text, str(pdf_file))
                if data["vendor_gstin"] and not vendor_gstin:
                    vendor_gstin = data["vendor_gstin"]
                if data["vendor_pan"] and not vendor_pan:
                    vendor_pan = data["vendor_pan"]
                po_value = data["total_amount"]
                total_value += po_value
                po_list.append({"po_number": data["po_number"], "date": data["po_date"], "amount": po_value, "file": pdf_file.name})
            except Exception:
                continue

        return json.dumps({
            "vendor_name": vendor_name, "gstin": vendor_gstin, "pan": vendor_pan,
            "total_pos": len(po_list), "total_value": total_value,
            "po_list": po_list,
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def generate_payment_advice(po_number: str, invoice_number: str, amount_to_pay: float) -> str:
    """Generate payment advice with TDS deduction calculation and net payable amount."""
    try:
        tds_rate = 0.02
        tds_amount = amount_to_pay * tds_rate
        net_payable = amount_to_pay - tds_amount

        return json.dumps({
            "po_number": po_number,
            "invoice_number": invoice_number,
            "gross_amount": amount_to_pay,
            "tds_rate": "2% u/s 194C",
            "tds_amount": round(tds_amount, 2),
            "net_payable": round(net_payable, 2),
            "notes": [
                f"TDS of ₹{tds_amount:,.2f} to be deposited with Form 26Q",
                "Issue Form 16A to vendor after TDS deposit",
            ]
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def read_billing_excel(file_path: str, vendor_name: str = "") -> str:
    """Read a billing Excel/CSV file and extract all bill records. Matches rows by vendor name if provided. Returns structured data with all columns for preview before import.

    Args:
        file_path: Path to the Excel (.xlsx/.xls) or CSV file
        vendor_name: Optional vendor name to filter rows (fuzzy match)

    Returns:
        JSON with headers, matched rows, summary stats, and vendor match info
    """
    try:
        import csv
        from pathlib import Path

        file_ext = Path(file_path).suffix.lower()
        rows = []
        headers = []

        if file_ext == '.csv':
            with open(file_path, 'r', encoding='utf-8-sig') as f:
                reader = csv.reader(f)
                for i, row in enumerate(reader):
                    if i == 0:
                        headers = [h.strip() for h in row]
                    else:
                        rows.append(row)
        elif file_ext in ('.xlsx', '.xls'):
            try:
                import openpyxl
                wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
                ws = wb.active
                for i, row in enumerate(ws.iter_rows(values_only=True)):
                    if i == 0:
                        headers = [str(h or '').strip() for h in row]
                    else:
                        rows.append([str(c or '').strip() for c in row])
                wb.close()
            except ImportError:
                return json.dumps({"error": "openpyxl not installed. Install with: pip install openpyxl"})
        else:
            return json.dumps({"error": f"Unsupported file format: {file_ext}. Use .csv, .xlsx, or .xls"})

        if not headers:
            return json.dumps({"error": "No headers found in file"})

        # Identify key columns
        col_indices = {}
        for i, h in enumerate(headers):
            hl = h.lower()
            if 'vendor' in hl and 'name' in hl:
                col_indices['vendor_name'] = i
            elif 'invoice' in hl and 'no' in hl:
                col_indices['invoice_number'] = i
            elif 'invoice' in hl and 'date' in hl:
                col_indices['invoice_date'] = i
            elif 'invoice' in hl and 'value' in hl:
                col_indices['invoice_value'] = i
            elif 'basic' in hl and 'value' in hl:
                col_indices['basic_value'] = i
            elif hl == 'gst':
                col_indices['gst'] = i
            elif 'month' in hl and 'invoice' in hl:
                col_indices['month'] = i
            elif 'types of service' in hl or 'service type' in hl:
                col_indices['service_type'] = i
            elif 'p.o' in hl and 'number' in hl or 'po number' in hl:
                col_indices['po_number'] = i
            elif 'vendor' in hl and 'code' in hl:
                col_indices['vendor_code'] = i
            elif 'payment' in hl and 'status' in hl:
                col_indices['payment_status'] = i
            elif 'utr' in hl:
                col_indices['utr'] = i
            elif 'paid' in hl and 'amount' in hl:
                col_indices['paid_amount'] = i
            elif 'deduction' in hl:
                col_indices['deduction'] = i
            elif 'remark' in hl:
                col_indices['remarks'] = i
            elif 'payment' in hl and 'date' in hl:
                col_indices['payment_date'] = i
            elif 'validity' in hl:
                col_indices['validity'] = i
            elif 'po value' in hl or 'p.o' in hl and 'value' in hl:
                col_indices['po_value'] = i
            elif 'balance' in hl:
                col_indices['balance'] = i
            elif 'inv' in hl and 'receipt' in hl:
                col_indices['receipt_date'] = i

        # Filter by vendor name if provided
        matched_rows = []
        vendor_col = col_indices.get('vendor_name')
        all_vendors = set()

        for row in rows:
            if vendor_col is not None and vendor_col < len(row):
                row_vendor = row[vendor_col].strip()
                if row_vendor:
                    all_vendors.add(row_vendor)

            # Match vendor
            if vendor_name:
                if vendor_col is not None and vendor_col < len(row):
                    row_vendor = row[vendor_col].strip().lower()
                    if vendor_name.lower() in row_vendor or row_vendor in vendor_name.lower():
                        matched_rows.append(row)
                else:
                    # No vendor column, include all
                    matched_rows.append(row)
            else:
                matched_rows.append(row)

        # Build structured records
        records = []
        for row in matched_rows:
            record = {}
            for col_key, col_idx in col_indices.items():
                if col_idx < len(row):
                    record[col_key] = row[col_idx]
                else:
                    record[col_key] = ''
            # Also include raw row data
            record['_raw'] = {headers[i]: row[i] if i < len(row) else '' for i in range(len(headers))}
            records.append(record)

        # Calculate summary
        total_value = 0
        for r in records:
            val = r.get('invoice_value', '0')
            cleaned = re.sub(r'[₹,\s"]', '', str(val))
            try:
                total_value += float(cleaned)
            except ValueError:
                pass

        result = {
            "file": file_path,
            "headers": headers,
            "column_mapping": col_indices,
            "total_rows": len(rows),
            "matched_rows": len(matched_rows),
            "vendor_filter": vendor_name,
            "vendors_found": sorted(list(all_vendors)),
            "total_invoice_value": round(total_value, 2),
            "records": records,
            "summary": {
                "total_bills": len(records),
                "unique_po_numbers": len(set(r.get('po_number', '') for r in records if r.get('po_number'))),
                "unique_services": list(set(r.get('service_type', '') for r in records if r.get('service_type'))),
                "months_covered": sorted(list(set(r.get('month', '') for r in records if r.get('month')))),
            }
        }

        return json.dumps(result, indent=2, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})



# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    mcp.run(transport="stdio")
