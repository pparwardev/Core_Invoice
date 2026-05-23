import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('purchase_orders', (t) => {
    t.string('bill_to_name');
    t.text('bill_to_address');
    t.text('ship_to_address');
    t.string('supplier_name');
    t.string('erp_pr_number');
    t.string('erp_pr_type');
    t.string('erp_po_number');
    t.string('wbs_id');
    t.string('payment_terms');
    t.string('requested_type');
    t.string('expected_delivery');
    t.string('service_start_date');
    t.string('service_end_date');
    t.string('hsn_sac_code');
    t.string('item_code');
    t.text('item_description');
    t.string('uom');
    t.decimal('quantity', 10, 2);
    t.decimal('unit_rate', 14, 2);
    t.decimal('discount_pct', 5, 2).defaultTo(0);
    t.decimal('discount_amt', 14, 2).defaultTo(0);
    t.decimal('basic_amount', 14, 2).defaultTo(0);
    t.decimal('cgst_pct', 5, 2).defaultTo(0);
    t.decimal('cgst_amt', 14, 2).defaultTo(0);
    t.decimal('sgst_pct', 5, 2).defaultTo(0);
    t.decimal('sgst_amt', 14, 2).defaultTo(0);
    t.decimal('rcm_cgst_pct', 5, 2).defaultTo(0);
    t.decimal('rcm_cgst_amt', 14, 2).defaultTo(0);
    t.decimal('rcm_sgst_pct', 5, 2).defaultTo(0);
    t.decimal('rcm_sgst_amt', 14, 2).defaultTo(0);
    t.decimal('total_amount', 14, 2).defaultTo(0);
    t.decimal('advance_payable', 14, 2).defaultTo(0);
    t.string('amount_in_words');
    t.text('invoice_requirements');
    t.text('extracted_raw_json');
    t.string('file_path');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('purchase_orders', (t) => {
    const cols = ['bill_to_name','bill_to_address','ship_to_address','supplier_name','erp_pr_number','erp_pr_type','erp_po_number','wbs_id','payment_terms','requested_type','expected_delivery','service_start_date','service_end_date','hsn_sac_code','item_code','item_description','uom','quantity','unit_rate','discount_pct','discount_amt','basic_amount','cgst_pct','cgst_amt','sgst_pct','sgst_amt','rcm_cgst_pct','rcm_cgst_amt','rcm_sgst_pct','rcm_sgst_amt','total_amount','advance_payable','amount_in_words','invoice_requirements','extracted_raw_json','file_path'];
    cols.forEach(c => t.dropColumn(c));
  });
}
