import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Clear all tables
  const tables = [
    'notifications', 'documents', 'diesel_purchases',
    'wcr_signatories', 'work_completion_reports',
    'invoice_line_items', 'invoices',
    'log_entries', 'log_sheets', 'billing_records',
    'purchase_orders', 'vendor_services', 'vendor_sections', 'vendors',
    'company_info', 'sections', 'users',
  ];
  for (const t of tables) {
    await knex(t).del();
  }

  // Sections
  await knex('sections').insert([
    { id: 1, name: 'REFINERY', code: 'REF' },
    { id: 2, name: 'POWER-ENGINEERING SERVICE', code: 'PES' },
    { id: 3, name: 'POWER-MMD', code: 'MMD' },
  ]);

  // Company Info
  await knex('company_info').insert({
    name: 'Bluspring Enterprises Limited',
    gstin: '21AAMCB3236E1Z5',
    pan: 'AAMCB3236E',
    state: 'Odisha',
    state_code: '21',
    address: 'C/O-UAIL, AT-DORAGUDA, PO-KUCHEIPADAR, DIST-RAYAGADA, PIN 765015',
    pincode: '765015',
    hsn_vehicle: '996412',
    hsn_food: '996339',
    hsn_service: '998511',
  });

  // Admin user (password: admin123)
  await knex('users').insert({
    name: 'Admin',
    email: 'admin@coreinvoice.com',
    password_hash: '$2b$10$i1zOBLIieFBwvyhxtvG1COUu38O3iiI5NMQdnwt3YxrPzGjbjc/m.',
  });

  // ============================================================
  // VENDOR MASTER — One row per actual vendor entity
  // ============================================================
  interface VendorMaster {
    name: string;
    gstin?: string;
    stateCode: string;
    gstRegistered: boolean;
    vendorType: string;
    services: { sectionId: number; serviceType: string; serviceSubtype?: string; vendorCode: string; vehicleNumber?: string; vehicleModel?: string; seatingCapacity?: number }[];
  }

  const vendorMasters: VendorMaster[] = [
    // --- M/s. Lalita Naik ---
    { name: 'M/s. Lalita Naik', gstin: '21AABPL1234F1Z5', stateCode: '21', gstRegistered: true, vendorType: 'Firm', services: [
      { sectionId: 1, serviceType: 'House Keeping', serviceSubtype: 'Electrical', vendorCode: 'r1' },
      { sectionId: 1, serviceType: 'House Keeping', serviceSubtype: 'Mechanical', vendorCode: 'r2' },
      { sectionId: 1, serviceType: 'House Keeping', serviceSubtype: 'Instrumentation', vendorCode: 'r3' },
    ]},
    // --- SUSHANTA NAG ---
    { name: 'SUSHANTA NAG', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [
      { sectionId: 1, serviceType: 'Transport - Camper', vendorCode: 'r4', vehicleNumber: 'OD-07-A-1234' },
    ]},
    // --- Pinki Bhatra ---
    { name: 'Pinki Bhatra', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [
      { sectionId: 1, serviceType: 'Transport - Camper', vendorCode: 'r5', vehicleNumber: 'OD-07-B-5678' },
      { sectionId: 3, serviceType: 'Transport - Bus', vendorCode: 'm1' },
      { sectionId: 3, serviceType: 'Transport - Bolero', vendorCode: 'm2', vehicleModel: 'Bolero' },
    ]},
    // --- Lalbahadur Naik ---
    { name: 'Lalbahadur Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [
      { sectionId: 1, serviceType: 'Transport - Bus', serviceSubtype: 'Bus-7029', vendorCode: 'r6', vehicleNumber: 'OD-02-AH-7029', seatingCapacity: 42 },
      { sectionId: 1, serviceType: 'Transport - Bus', serviceSubtype: 'Bus-0575', vendorCode: 'r7', vehicleNumber: 'OD-02-AJ-0575', seatingCapacity: 42 },
    ]},
    // --- Bidyadhar Nayak ---
    { name: 'Bidyadhar Nayak', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [
      { sectionId: 1, serviceType: 'Transport - Bus', vendorCode: 'r8' },
      { sectionId: 1, serviceType: 'Transport - Camper', vendorCode: 'r9' },
    ]},
    // --- Sukanta Bagh ---
    { name: 'Sukanta Bagh', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [
      { sectionId: 1, serviceType: 'Transport - Camper', vendorCode: 'r10', vehicleNumber: 'OD-07-C-9012' },
    ]},
    // --- Renuka Naik ---
    { name: 'Renuka Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [
      { sectionId: 1, serviceType: 'Transport - Bolero', vendorCode: 'r11', vehicleModel: 'Bolero' },
    ]},
    // --- Nazarene Travels ---
    { name: 'Nazarene Travels', gstin: '21AABFN5678G1Z2', stateCode: '21', gstRegistered: true, vendorType: 'Firm', services: [
      { sectionId: 1, serviceType: 'Transport - Bolero', vendorCode: 'r12' },
      { sectionId: 1, serviceType: 'Transport - Bus', vendorCode: 'r13' },
      { sectionId: 1, serviceType: 'Transport - Palfinger', serviceSubtype: 'Palfinger-7399', vendorCode: 'r14' },
      { sectionId: 1, serviceType: 'Transport - Palfinger', serviceSubtype: 'Palfinger-7186', vendorCode: 'r15' },
    ]},
    // --- Sabala Naik ---
    { name: 'Sabala Naik', gstin: '21AABPS9012H1Z8', stateCode: '21', gstRegistered: true, vendorType: 'Individual', services: [
      { sectionId: 1, serviceType: 'Hydra Service', vendorCode: 'r16' },
    ]},

    // --- AK Engineering ---
    { name: 'AK Engineering', gstin: '21AABFA3456I1Z4', stateCode: '21', gstRegistered: true, vendorType: 'Firm', services: [
      { sectionId: 1, serviceType: 'Forklift Service', vendorCode: 'r17' },
      { sectionId: 1, serviceType: 'Hydra Service', vendorCode: 'r18' },
      { sectionId: 1, serviceType: 'Trailor Service', vendorCode: 'r19' },
      { sectionId: 1, serviceType: 'Manpower Supply', serviceSubtype: 'Fitter/Welder/Rigger', vendorCode: 'r19b' },
      { sectionId: 1, serviceType: 'Tools & Tackles', vendorCode: 'r19c' },
      { sectionId: 2, serviceType: 'Hydra Service', serviceSubtype: '23T Hydra', vendorCode: 'p1' },
      { sectionId: 2, serviceType: 'Manpower Supply', vendorCode: 'p15' },
      { sectionId: 2, serviceType: 'Tools & Tackles', vendorCode: 'p16' },
    ]},
    // --- Logistic Enterprises ---
    { name: 'Logistic Enterprises', gstin: '27AABFL7890J1Z0', stateCode: '27', gstRegistered: true, vendorType: 'Firm', services: [
      { sectionId: 1, serviceType: 'Crane Service', serviceSubtype: '40T', vendorCode: 'r20' },
      { sectionId: 1, serviceType: 'Crane Service', serviceSubtype: '200T', vendorCode: 'r21' },
    ]},
    // --- Paramanand Naik ---
    { name: 'Paramanand Naik', gstin: '21AABPP1234K1Z6', stateCode: '21', gstRegistered: true, vendorType: 'Individual', services: [
      { sectionId: 1, serviceType: 'Transport - Palfinger', vendorCode: 'r22' },
    ]},
    // --- PBL Transport ---
    { name: 'PBL Transport', gstin: '21AABFP5678L1Z2', stateCode: '21', gstRegistered: true, vendorType: 'Firm', services: [
      { sectionId: 1, serviceType: 'Crane Service', serviceSubtype: '100T', vendorCode: 'r23' },
    ]},
    // --- Pabitra Naik ---
    { name: 'Pabitra Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [
      { sectionId: 1, serviceType: 'Pipeline Service', vendorCode: 'r24' },
    ]},
    // --- House Rent Vendors (Refinery) ---
    { name: 'Sudam Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 1, serviceType: 'House Rent', vendorCode: 'r25' }] },
    { name: 'Shantasil Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 1, serviceType: 'House Rent', vendorCode: 'r26' }] },
    { name: 'Sarojini Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 1, serviceType: 'House Rent', vendorCode: 'r27' }] },
    { name: 'Baleswar Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 1, serviceType: 'House Rent', vendorCode: 'r28' }] },
    { name: 'Loni Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 1, serviceType: 'House Rent', vendorCode: 'r29' }] },
    { name: 'Uttam Kumar Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 1, serviceType: 'House Rent', vendorCode: 'r30' }] },
    { name: 'Manoj Kumar Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 1, serviceType: 'House Rent', vendorCode: 'r31' }] },
    { name: 'Sumitra Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 1, serviceType: 'House Rent', vendorCode: 'r32' }] },
    { name: 'Mohini Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 1, serviceType: 'House Rent', vendorCode: 'r33' }] },
    // --- Food / Other Refinery ---
    { name: 'Ganeswar Hospitality Service', gstin: '21AABFG1234P1Z6', stateCode: '21', gstRegistered: true, vendorType: 'Firm', services: [{ sectionId: 1, serviceType: 'Food Supply', vendorCode: 'r34' }] },
    { name: 'Ruchi Hotel', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 1, serviceType: 'Food Supply', vendorCode: 'r35' }] },
    { name: 'MAINTWIZ', gstin: '33AABFM9012M1Z8', stateCode: '33', gstRegistered: true, vendorType: 'Company', services: [{ sectionId: 1, serviceType: 'CMMS Service', vendorCode: 'r36' }] },
    { name: 'United Eco Care Consultancy', gstin: '21AABCU3456N1Z4', stateCode: '21', gstRegistered: true, vendorType: 'Company', services: [{ sectionId: 1, serviceType: 'Scientific & Technical Services', vendorCode: 'r37' }] },
    { name: 'GANESH COMPUTER', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 1, serviceType: 'Printing / Supplies', vendorCode: 'r38' }] },
    { name: 'Maa Sarala Enterprises', stateCode: '21', gstRegistered: false, vendorType: 'Firm', services: [{ sectionId: 1, serviceType: 'Labour / Contractor', vendorCode: 'r39' }] },
    { name: 'Allan Smith Engineering Pvt Ltd', gstin: '27AABCA7890E1Z0', stateCode: '27', gstRegistered: true, vendorType: 'Company', services: [{ sectionId: 1, serviceType: 'Engineering Services', vendorCode: 'r40' }] },
    { name: 'AVM Labs Pvt Ltd', gstin: '33AABCA7890O1Z0', stateCode: '33', gstRegistered: true, vendorType: 'Company', services: [{ sectionId: 1, serviceType: 'Calibration / Lab Services', vendorCode: 'r41' }] },
    { name: 'Instrumentation & Power Control Services', stateCode: '21', gstRegistered: true, vendorType: 'Firm', services: [{ sectionId: 1, serviceType: 'Engineering Services', vendorCode: 'r42' }] },
    { name: 'Maruti Metaseal', stateCode: '21', gstRegistered: false, vendorType: 'Firm', services: [{ sectionId: 1, serviceType: 'Printing / Supplies', vendorCode: 'r43' }] },
    { name: 'Ramakanta Mohanty', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 1, serviceType: 'Other Services', vendorCode: 'r44' }] },
    { name: 'RK Trading', stateCode: '21', gstRegistered: false, vendorType: 'Firm', services: [{ sectionId: 1, serviceType: 'Printing / Supplies', vendorCode: 'r45' }] },
    { name: 'SM Computers', stateCode: '21', gstRegistered: false, vendorType: 'Firm', services: [{ sectionId: 1, serviceType: 'IT / Computer Services', vendorCode: 'r46' }] },
    { name: 'Techalliy Computer Services Pvt Ltd', gstin: '07AABCT1234D1Z0', stateCode: '07', gstRegistered: true, vendorType: 'Company', services: [{ sectionId: 1, serviceType: 'IT / Computer Services', vendorCode: 'r47' }] },

    // --- POWER-ENGINEERING vendors ---
    { name: 'Bhusan Bhatra', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'Bob Cat Service', vendorCode: 'p2' }] },
    { name: 'Ramesh Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'Transport - Bolero', vendorCode: 'p3', vehicleModel: 'Bolero' }] },
    { name: 'Navi Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'Transport - Bolero', vendorCode: 'p4', vehicleModel: 'Bolero' }] },
    { name: 'Saranjula Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'Transport - Bus', vendorCode: 'p5', seatingCapacity: 32 }] },
    { name: 'Prusty Duria', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'Transport - Camper', vendorCode: 'p6' }] },
    { name: 'Roshan Construction Company', gstin: '21AABFR3456Q1Z2', stateCode: '21', gstRegistered: true, vendorType: 'Firm', services: [{ sectionId: 2, serviceType: 'Dozzer Service', vendorCode: 'p7' }] },
    { name: 'Namita Pujari', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'House Rent', vendorCode: 'p8' }] },
    { name: 'RABI CHANDRA SAHU', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'Guest House Rent', vendorCode: 'p9' }] },
    { name: 'BALMIKI SAHU', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'House Rent', vendorCode: 'p10' }] },
    { name: 'RANJITA SAHU', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'Guest House Electricity', vendorCode: 'p11' }] },
    { name: 'MEENAKSHI SAHU', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'House Rent', vendorCode: 'p12' }] },
    { name: 'Michael Benia', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'Tipper Service', vendorCode: 'p13' }] },
    { name: 'Suranjali Khsola', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'Bob Cat Service', vendorCode: 'p14' }] },
    { name: 'Prashanta Khara', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 2, serviceType: 'Food Supply', vendorCode: 'p17' }] },
    // --- POWER-MMD vendors ---
    { name: 'Lalita Naik (MMD)', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 3, serviceType: 'Transport - Camper', vendorCode: 'm3' }] },
    { name: 'Kumari Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 3, serviceType: 'House Rent', vendorCode: 'm4' }] },
    { name: 'Ram Murti Naik', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 3, serviceType: 'House Rent', vendorCode: 'm5' }] },
    { name: 'Payal Tulo', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 3, serviceType: 'House Rent', vendorCode: 'm6' }] },
    { name: 'Tripati Prasad Tulo', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 3, serviceType: 'House Rent', vendorCode: 'm7' }] },
    { name: 'Sabita Sadangi', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 3, serviceType: 'House Rent', vendorCode: 'm8' }] },
    { name: 'Suraj Kumar Panda', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 3, serviceType: 'House Rent', vendorCode: 'm9' }] },
    { name: 'SUDAM NAIK (MMD)', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 3, serviceType: 'House Rent', vendorCode: 'm10' }] },
    { name: 'HOTEL GANESH', stateCode: '21', gstRegistered: false, vendorType: 'Individual', services: [{ sectionId: 3, serviceType: 'Food Supply', vendorCode: 'm11' }] },
  ];

  // Insert vendors and their services
  for (const vm of vendorMasters) {
    const [vendorId] = await knex('vendors').insert({
      name: vm.name,
      vendor_code: vm.services[0].vendorCode,
      service_type: vm.services.map(s => s.serviceType).join(', '),
      gstin: vm.gstin || null,
      state_code: vm.stateCode,
      state: vm.stateCode === '27' ? 'Maharashtra' : vm.stateCode === '33' ? 'Tamil Nadu' : vm.stateCode === '07' ? 'Delhi' : 'Odisha',
      gst_registered: vm.gstRegistered,
      vendor_type: vm.vendorType,
      is_active: true,
    });

    // Insert each service line
    for (const svc of vm.services) {
      await knex('vendor_services').insert({
        vendor_id: vendorId,
        section_id: svc.sectionId,
        service_type: svc.serviceType,
        service_subtype: svc.serviceSubtype || null,
        vendor_code: svc.vendorCode,
        vehicle_number: svc.vehicleNumber || null,
        vehicle_model: svc.vehicleModel || null,
        seating_capacity: svc.seatingCapacity || null,
      });
    }

    // Insert vendor-section mappings (unique departments)
    const uniqueSections = [...new Set(vm.services.map(s => s.sectionId))];
    for (const sid of uniqueSections) {
      await knex('vendor_sections').insert({ vendor_id: vendorId, section_id: sid });
    }
  }

  // ============ DIESEL PURCHASES ============
  await knex('diesel_purchases').insert([
    { purchase_date: '2025-05-05', liters: 500, price_per_liter: 89.50, total_cost: 44750, bill_number: 'D-001', pump_name: 'HP Petrol Pump Rayagada', month: 5, year: 2025 },
    { purchase_date: '2025-05-12', liters: 450, price_per_liter: 89.75, total_cost: 40387.50, bill_number: 'D-002', pump_name: 'HP Petrol Pump Rayagada', month: 5, year: 2025 },
    { purchase_date: '2025-05-20', liters: 600, price_per_liter: 90.00, total_cost: 54000, bill_number: 'D-003', pump_name: 'Indian Oil Rayagada', month: 5, year: 2025 },
    { purchase_date: '2025-06-03', liters: 500, price_per_liter: 90.10, total_cost: 45050, bill_number: 'D-005', pump_name: 'Indian Oil Rayagada', month: 6, year: 2025 },
    { purchase_date: '2025-06-18', liters: 520, price_per_liter: 90.00, total_cost: 46800, bill_number: 'D-007', pump_name: 'Indian Oil Rayagada', month: 6, year: 2025 },
  ]);

  console.log(`✅ Seeded ${vendorMasters.length} vendors with ${vendorMasters.reduce((s, v) => s + v.services.length, 0)} service lines`);
}
