import json, sys, glob
sys.path.insert(0, '.')
from server import read_billing_excel

# Find CSV file
csvs = glob.glob('/home/pparwar/Core_invoice/server/data/uploads/*.csv')
print('CSV files found:', csvs)

if csvs:
    result = read_billing_excel(csvs[0], 'Bidyadhar Nayak')
    data = json.loads(result)
    print('\n=== HEADERS ===')
    print(data.get('headers'))
    print('\n=== COLUMN MAPPING ===')
    print(json.dumps(data.get('column_mapping'), indent=2))
    print('\n=== STATS ===')
    print(f"Total rows: {data.get('total_rows')}")
    print(f"Matched rows: {data.get('matched_rows')}")
    print(f"Vendors found: {data.get('vendors_found')}")
    if data.get('records'):
        print(f"\n=== FIRST RECORD (of {len(data['records'])}) ===")
        print(json.dumps(data['records'][0], indent=2, ensure_ascii=False))
    if data.get('summary'):
        print('\n=== SUMMARY ===')
        print(json.dumps(data['summary'], indent=2))
else:
    print('No CSV files found. Testing with sample data...')
    # Create a small test
    import tempfile, os
    test_csv = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False)
    test_csv.write('Sl No,Vendor Name,Types of service,P.O Number,Vendor Code,Invoice Number,Invoice Date,Basic value,GST,Invoice Value,Month of Invoice,Payment Status,UTR Details\n')
    test_csv.write('7,Bidyadhar Nayak,Bus & Camper service,4200069540,1000288,,4/8/2023,,," 132,705 ",Mar\'2023,,,\n')
    test_csv.write('8,Bidyadhar Nayak,Bus service,4200107860,1000288,149/BUS,6/2/2025,,,148030.74,May\'2025,Done,INF/NEFT/123\n')
    test_csv.close()
    
    result = read_billing_excel(test_csv.name, 'Bidyadhar Nayak')
    data = json.loads(result)
    print('\n=== HEADERS ===')
    print(data.get('headers'))
    print('\n=== COLUMN MAPPING ===')
    print(json.dumps(data.get('column_mapping'), indent=2))
    print(f"\n=== RECORDS ({len(data.get('records', []))}) ===")
    for r in data.get('records', []):
        rec = {k:v for k,v in r.items() if k != '_raw' and v}
        print(json.dumps(rec, ensure_ascii=False))
    os.unlink(test_csv.name)
