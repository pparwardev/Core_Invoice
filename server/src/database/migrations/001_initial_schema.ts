import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Users
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('email').notNullable().unique();
    t.string('password_hash').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Sections/Departments
  await knex.schema.createTable('sections', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable().unique();
    t.string('code').notNullable().unique();
  });

  // Company Info
  await knex.schema.createTable('company_info', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('gstin');
    t.string('pan');
    t.string('state');
    t.string('state_code');
    t.text('address');
    t.string('pincode');
    t.string('phone');
    t.string('email');
    t.string('hsn_vehicle');
    t.string('hsn_food');
    t.string('hsn_service');
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Vendors
  await knex.schema.createTable('vendors', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('vendor_code');
    t.string('service_type').notNullable();
    t.string('service_subtype');
    t.string('gstin');
    t.string('pan');
    t.text('address');
    t.string('state');
    t.string('state_code');
    t.string('pincode');
    t.string('contact_person');
    t.string('phone');
    t.string('email');
    t.string('bank_name');
    t.string('bank_account_no');
    t.string('bank_ifsc');
    t.string('bank_branch');
    t.boolean('gst_registered').defaultTo(false);
    t.string('vendor_type').defaultTo('Individual'); // Individual|Firm|Company|LLP
    t.string('vehicle_number');
    t.string('vehicle_model');
    t.integer('seating_capacity');
    t.boolean('is_active').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Vendor-Section mapping
  await knex.schema.createTable('vendor_sections', (t) => {
    t.increments('id').primary();
    t.integer('vendor_id').references('id').inTable('vendors').onDelete('CASCADE');
    t.integer('section_id').references('id').inTable('sections').onDelete('CASCADE');
    t.unique(['vendor_id', 'section_id']);
  });

  // Purchase Orders
  await knex.schema.createTable('purchase_orders', (t) => {
    t.increments('id').primary();
    t.integer('vendor_id').references('id').inTable('vendors').onDelete('CASCADE');
    t.string('po_number').notNullable();
    t.string('po_date');
    t.string('validity_date');
    t.decimal('po_value', 14, 2).defaultTo(0);
    t.text('service_description');
    t.boolean('is_diesel_po').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Billing Records
  await knex.schema.createTable('billing_records', (t) => {
    t.increments('id').primary();
    t.integer('vendor_id').references('id').inTable('vendors').onDelete('CASCADE');
    t.integer('purchase_order_id').references('id').inTable('purchase_orders').onDelete('SET NULL');
    t.integer('section_id').references('id').inTable('sections');
    t.integer('billing_period_month').notNullable();
    t.integer('billing_period_year').notNullable();
    t.string('status').defaultTo('draft'); // draft|log_sheet_done|invoice_done|wcr_done|finalized
    t.string('payment_status').defaultTo('pending'); // pending|partial|paid|hold
    t.decimal('deduction_amount', 12, 2).defaultTo(0);
    t.text('deduction_remarks');
    t.decimal('paid_amount', 12, 2);
    t.string('utr_details');
    t.string('payment_date');
    t.text('remarks');
    t.boolean('finalized').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Log Sheets
  await knex.schema.createTable('log_sheets', (t) => {
    t.increments('id').primary();
    t.integer('billing_record_id').references('id').inTable('billing_records').onDelete('CASCADE');
    t.string('period_start');
    t.string('period_end');
    t.string('vehicle_number');
    t.string('vehicle_model');
    t.string('device_name');
    t.decimal('total_mileage_km', 10, 2);
    t.decimal('agreed_km', 10, 2);
    t.integer('total_days');
    t.integer('total_breakdown_days').defaultTo(0);
    t.decimal('month_starting_km', 10, 2);
    t.decimal('month_ending_km', 10, 2);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Log Entries
  await knex.schema.createTable('log_entries', (t) => {
    t.increments('id').primary();
    t.integer('log_sheet_id').references('id').inTable('log_sheets').onDelete('CASCADE');
    t.string('entry_date');
    t.string('device_name');
    t.text('route_description');
    t.decimal('starting_km', 10, 2);
    t.decimal('ending_km', 10, 2);
    t.decimal('total_km', 10, 2);
    t.text('remark');
  });

  // Invoices
  await knex.schema.createTable('invoices', (t) => {
    t.increments('id').primary();
    t.integer('billing_record_id').references('id').inTable('billing_records').onDelete('CASCADE');
    t.string('invoice_number').notNullable();
    t.string('invoice_date');
    t.string('invoice_receipt_date');
    t.string('nature').defaultTo('Original');
    t.decimal('basic_value', 14, 2).defaultTo(0);
    t.decimal('gst_percentage', 5, 2).defaultTo(18);
    t.decimal('gst_amount', 14, 2).defaultTo(0);
    t.decimal('invoice_value', 14, 2).defaultTo(0);
    t.string('hsn_sac_code');
    t.string('billed_to_name');
    t.text('billed_to_address');
    t.text('consignee_address');
    t.string('place_of_supply');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Invoice Line Items
  await knex.schema.createTable('invoice_line_items', (t) => {
    t.increments('id').primary();
    t.integer('invoice_id').references('id').inTable('invoices').onDelete('CASCADE');
    t.integer('sr_no').defaultTo(1);
    t.text('description');
    t.string('hsn_sac');
    t.decimal('quantity', 10, 2);
    t.string('unit');
    t.decimal('unit_price', 12, 2);
    t.decimal('amount', 14, 2).defaultTo(0);
    t.boolean('is_diesel').defaultTo(false);
    t.decimal('diesel_rate', 8, 2);
    t.decimal('diesel_litres', 10, 2);
  });

  // Work Completion Reports
  await knex.schema.createTable('work_completion_reports', (t) => {
    t.increments('id').primary();
    t.integer('billing_record_id').references('id').inTable('billing_records').onDelete('CASCADE');
    t.string('report_date');
    t.string('document_ref').defaultTo('QHSE-AC-F-0002-5');
    t.string('revision').defaultTo('Rev 4');
    t.string('site_name');
    t.string('location');
    t.string('client_name');
    t.text('work_summary');
    t.string('invoice_reference');
    t.decimal('invoice_value', 14, 2);
    t.string('amount_in_words');
    t.string('mode_of_delivery').defaultTo('Service at site');
    t.text('documents_enclosed');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // WCR Signatories
  await knex.schema.createTable('wcr_signatories', (t) => {
    t.increments('id').primary();
    t.integer('wcr_id').references('id').inTable('work_completion_reports').onDelete('CASCADE');
    t.string('role');
    t.string('name');
    t.integer('sign_order');
  });

  // Diesel Purchases
  await knex.schema.createTable('diesel_purchases', (t) => {
    t.increments('id').primary();
    t.string('purchase_date').notNullable();
    t.decimal('liters', 10, 2).notNullable();
    t.decimal('price_per_liter', 8, 2).notNullable();
    t.decimal('total_cost', 12, 2).notNullable();
    t.string('bill_number');
    t.string('pump_name');
    t.integer('month');
    t.integer('year');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Uploaded Documents
  await knex.schema.createTable('documents', (t) => {
    t.increments('id').primary();
    t.string('file_name').notNullable();
    t.string('file_path');
    t.string('file_type'); // logsheet|po|invoice|wcr|eway|other
    t.integer('file_size');
    t.integer('vendor_id').references('id').inTable('vendors').onDelete('SET NULL');
    t.string('vendor_name');
    t.string('month');
    t.string('department');
    t.string('status').defaultTo('processing'); // processing|mapped|error
    t.text('extracted_data'); // JSON
    t.text('summary');
    t.timestamp('uploaded_at').defaultTo(knex.fn.now());
  });

  // Notifications
  await knex.schema.createTable('notifications', (t) => {
    t.increments('id').primary();
    t.string('type').notNullable(); // po_expiry|budget_warning|document_processed
    t.string('title').notNullable();
    t.text('message');
    t.integer('vendor_id').references('id').inTable('vendors').onDelete('SET NULL');
    t.boolean('read').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'notifications', 'documents', 'diesel_purchases',
    'wcr_signatories', 'work_completion_reports',
    'invoice_line_items', 'invoices',
    'log_entries', 'log_sheets', 'billing_records',
    'purchase_orders', 'vendor_sections', 'vendors',
    'company_info', 'sections', 'users',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
