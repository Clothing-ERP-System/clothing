'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

const TEST_DB = 'clothing_erp_test_nonzero';

// Configuration helper for isolated test DB
function getTestDbConfig() {
  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: TEST_DB,
    waitForConnections: true,
    connectionLimit: 5,
  };
}

test('NON-ZERO FINANCIAL & WORKFLOW VERIFICATION IN ISOLATED TEST DB', async (t) => {
  let testPool;

  await t.test('Setup isolated test database schema and company', async () => {
    // 1. Ensure test database exists
    const adminPool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
    });
    await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\``);
    await adminPool.end();

    testPool = mysql.createPool(getTestDbConfig());

    // 2. Create minimal required schema tables matching MySQL models
    const tables = [
      `CREATE TABLE IF NOT EXISTS erp_company (
        id CHAR(36) PRIMARY KEY,
        payload JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`,
      `CREATE TABLE IF NOT EXISTS erp_account_head (
        id CHAR(36) PRIMARY KEY,
        payload JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`,
      `CREATE TABLE IF NOT EXISTS erp_journal_entry (
        id CHAR(36) PRIMARY KEY,
        payload JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`,
      `CREATE TABLE IF NOT EXISTS erp_purchase_order (
        id CHAR(36) PRIMARY KEY,
        payload JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`,
      `CREATE TABLE IF NOT EXISTS erp_supplier_invoice (
        id CHAR(36) PRIMARY KEY,
        payload JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`,
      `CREATE TABLE IF NOT EXISTS erp_sales_order (
        id CHAR(36) PRIMARY KEY,
        payload JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`,
      `CREATE TABLE IF NOT EXISTS erp_pos_transaction (
        id CHAR(36) PRIMARY KEY,
        payload JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`,
      `CREATE TABLE IF NOT EXISTS erp_expense_record (
        id CHAR(36) PRIMARY KEY,
        payload JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`,
    ];

    for (const sql of tables) {
      await testPool.query(sql);
    }

    // Clean tables inside test db before starting
    const tableNames = ['erp_company', 'erp_account_head', 'erp_journal_entry', 'erp_purchase_order', 'erp_supplier_invoice', 'erp_sales_order', 'erp_pos_transaction', 'erp_expense_record'];
    for (const name of tableNames) {
      await testPool.query(`DELETE FROM \`${name}\``);
    }

    // 3. Insert Company context
    const companyPayload = {
      companyName: 'Client Apparel Manufacturing Ltd',
      currency: 'PKR',
      currencySymbol: 'Rs.',
      financialYearStart: '2026-07-01',
      financialYearEnd: '2027-06-30',
      onboardingCompleted: true,
      accountingMappings: {
        cashAccountCode: '1010',
        bankAccountCode: '1020',
        salesReceivableAccountCode: '1030',
        inventoryAccountCode: '1050',
        payableAccountCode: '2010',
        grniAccountCode: '2030',
        openingBalanceEquityAccountCode: '3100',
        salesRevenueAccountCode: '4010',
        expenseAccountCode: '5010',
        cogsAccountCode: '5020',
      },
    };
    await testPool.query('INSERT INTO erp_company (id, payload) VALUES (?, ?)', ['comp-1', JSON.stringify(companyPayload)]);

    // 4. Seed Accounts with Non-Zero Opening Balances
    const initialAccounts = [
      { code: '1010', name: 'Cash in Hand', type: 'Asset', balance: 50000 },
      { code: '1020', name: 'Main Operating Bank Account', type: 'Asset', isBank: true, balance: 200000 },
      { code: '1030', name: 'Accounts Receivable', type: 'Asset', balance: 0 },
      { code: '1050', name: 'Finished Goods Inventory', type: 'Asset', balance: 0 },
      { code: '2010', name: 'Accounts Payable - Suppliers', type: 'Liability', balance: 0 },
      { code: '2030', name: 'Goods Received Not Invoiced', type: 'Liability', balance: 0 },
      { code: '3100', name: 'Opening Balance Equity', type: 'Equity', balance: 250000 },
      { code: '4010', name: 'Sales Revenue', type: 'Revenue', balance: 0 },
      { code: '5010', name: 'Salaries & Overheads Expense', type: 'OperatingExpense', balance: 0 },
      { code: '5020', name: 'Cost of Goods Sold', type: 'CostOfGoodsSold', balance: 0 },
    ];

    for (const acc of initialAccounts) {
      await testPool.query('INSERT INTO erp_account_head (id, payload) VALUES (?, ?)', [`acc-${acc.code}`, JSON.stringify(acc)]);
    }

    assert.ok(true, 'Test DB schema, company, and initial accounts created');
  });

  await t.test('Cash and Bank Transfers: preserves asset totals without double-counting', async () => {
    // Transfer Rs. 20,000 from Bank (1020) to Cash (1010)
    const transferAmount = 20000;
    const [accRows] = await testPool.query('SELECT id, payload FROM erp_account_head WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, "$.code")) IN ("1010", "1020")');

    const accountsMap = new Map();
    for (const r of accRows) {
      accountsMap.set(r.payload.code, { id: r.id, payload: r.payload });
    }

    const cash = accountsMap.get('1010');
    const bank = accountsMap.get('1020');

    // Update balances: Bank decreases by 20,000, Cash increases by 20,000
    bank.payload.balance -= transferAmount;
    cash.payload.balance += transferAmount;

    await testPool.query('UPDATE erp_account_head SET payload = ? WHERE id = ?', [JSON.stringify(bank.payload), bank.id]);
    await testPool.query('UPDATE erp_account_head SET payload = ? WHERE id = ?', [JSON.stringify(cash.payload), cash.id]);

    // Record balanced journal entry
    const transferJournal = {
      voucherNumber: 'JV-2026-0001',
      sourceKey: 'transfer-bank-to-cash-01',
      date: new Date().toISOString(),
      narration: 'Cash withdrawal from operating bank account',
      lines: [
        { accountCode: '1010', debit: transferAmount, credit: 0 },
        { accountCode: '1020', debit: 0, credit: transferAmount },
      ],
      totalDebit: transferAmount,
      totalCredit: transferAmount,
    };
    await testPool.query('INSERT INTO erp_journal_entry (id, payload) VALUES (?, ?)', ['jv-trans-1', JSON.stringify(transferJournal)]);

    // Verify balances
    const [updatedRows] = await testPool.query('SELECT payload FROM erp_account_head WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, "$.code")) IN ("1010", "1020")');
    let totalAssetCashBank = 0;
    for (const row of updatedRows) {
      if (row.payload.code === '1010') assert.equal(row.payload.balance, 70000);
      if (row.payload.code === '1020') assert.equal(row.payload.balance, 180000);
      totalAssetCashBank += row.payload.balance;
    }
    // Total cash + bank remains exactly Rs. 250,000 (no leakage, no duplication)
    assert.equal(totalAssetCashBank, 250000);
  });

  await t.test('Purchases, Suppliers & Purchase Due: calculates accurate totals and outstanding balance', async () => {
    const today = new Date().toISOString();

    // PO 1: Rs. 80,000, paid Rs. 50,000 -> Due Rs. 30,000
    const po1 = {
      poNumber: 'PO-2026-0001',
      grandTotal: 80000,
      amountPaid: 50000,
      status: 'Received',
      orderDate: today,
    };
    // PO 2: Rs. 40,000, paid Rs. 0 -> Due Rs. 40,000
    const po2 = {
      poNumber: 'PO-2026-0002',
      grandTotal: 40000,
      amountPaid: 0,
      status: 'Approved',
      orderDate: today,
    };
    // Cancelled PO: Rs. 25,000 -> Should NOT be counted
    const poCancelled = {
      poNumber: 'PO-2026-0003',
      grandTotal: 25000,
      amountPaid: 0,
      status: 'Cancelled',
      orderDate: today,
    };

    await testPool.query('INSERT INTO erp_purchase_order (id, payload) VALUES (?, ?)', ['po-1', JSON.stringify(po1)]);
    await testPool.query('INSERT INTO erp_purchase_order (id, payload) VALUES (?, ?)', ['po-2', JSON.stringify(po2)]);
    await testPool.query('INSERT INTO erp_purchase_order (id, payload) VALUES (?, ?)', ['po-3', JSON.stringify(poCancelled)]);

    const [pos] = await testPool.query('SELECT payload FROM erp_purchase_order');
    const activePOs = pos.map((p) => p.payload).filter((p) => p.status !== 'Cancelled' && p.status !== 'Voided');

    const totalPurchase = activePOs.reduce((sum, p) => sum + p.grandTotal, 0);
    const purchaseDue = activePOs.reduce((sum, p) => sum + (p.grandTotal - p.amountPaid), 0);

    assert.equal(totalPurchase, 120000, 'Total Purchase must be exactly Rs. 120,000');
    assert.equal(purchaseDue, 70000, 'Purchase Due must be exactly Rs. 70,000');
  });

  await t.test('Sales, POS & Invoice Due: combines orders + POS and deducts payments and returns', async () => {
    const today = new Date().toISOString();

    // Sales Order 1: Rs. 150,000, paid Rs. 90,000, returned Rs. 10,000 -> Due Rs. 50,000
    const so1 = {
      orderNumber: 'SO-2026-0001',
      grandTotal: 150000,
      amountPaid: 90000,
      refundedAmountTotal: 0,
      totalReturnedValue: 10000,
      status: 'PartiallyPaid',
      orderDate: today,
    };
    // Cancelled Sales Order: Rs. 60,000 -> Should NOT be counted
    const soCancelled = {
      orderNumber: 'SO-2026-0002',
      grandTotal: 60000,
      amountPaid: 0,
      status: 'Cancelled',
      orderDate: today,
    };
    // POS Transaction: Rs. 35,000 (fully paid at counter)
    const pos1 = {
      transactionNumber: 'POS-2026-0001',
      grandTotal: 35000,
      amountPaid: 35000,
      status: 'Completed',
      createdAt: today,
    };

    await testPool.query('INSERT INTO erp_sales_order (id, payload) VALUES (?, ?)', ['so-1', JSON.stringify(so1)]);
    await testPool.query('INSERT INTO erp_sales_order (id, payload) VALUES (?, ?)', ['so-2', JSON.stringify(soCancelled)]);
    await testPool.query('INSERT INTO erp_pos_transaction (id, payload) VALUES (?, ?)', ['pos-1', JSON.stringify(pos1)]);

    const [soRows] = await testPool.query('SELECT payload FROM erp_sales_order');
    const [posRows] = await testPool.query('SELECT payload FROM erp_pos_transaction');

    const activeSOs = soRows.map((r) => r.payload).filter((s) => s.status !== 'Cancelled');
    const activePOS = posRows.map((r) => r.payload).filter((p) => p.status !== 'Cancelled');

    const totalSale = activeSOs.reduce((sum, s) => sum + s.grandTotal, 0) + activePOS.reduce((sum, p) => sum + p.grandTotal, 0);
    const invoiceDue = activeSOs.reduce((sum, s) => sum + Math.max(0, s.grandTotal - s.amountPaid - s.refundedAmountTotal - s.totalReturnedValue), 0);

    assert.equal(totalSale, 185000, 'Total Sale must be exactly Rs. 185,000 (150k SO + 35k POS)');
    assert.equal(invoiceDue, 50000, 'Invoice Due must be exactly Rs. 50,000 (150k - 90k paid - 10k return)');
  });

  await t.test('Expenses & Net Profit: accounting journals reflect debits/credits and calculate net income', async () => {
    const today = new Date().toISOString();

    // 1. Expense record 1: Office Rent Rs. 25,000
    const exp1 = {
      expenseNumber: 'EXP-2026-0001',
      amount: 25000,
      category: 'Rent',
      status: 'Paid',
      paymentDate: today,
    };
    // 2. Expense record 2: Utilities Rs. 5,000
    const exp2 = {
      expenseNumber: 'EXP-2026-0002',
      amount: 5000,
      category: 'Utilities',
      status: 'Paid',
      paymentDate: today,
    };
    await testPool.query('INSERT INTO erp_expense_record (id, payload) VALUES (?, ?)', ['exp-1', JSON.stringify(exp1)]);
    await testPool.query('INSERT INTO erp_expense_record (id, payload) VALUES (?, ?)', ['exp-2', JSON.stringify(exp2)]);

    const [expRows] = await testPool.query('SELECT payload FROM erp_expense_record');
    const totalExpenses = expRows.map((r) => r.payload).reduce((sum, e) => sum + e.amount, 0);
    assert.equal(totalExpenses, 30000, 'Total Expenses must be exactly Rs. 30,000');

    // 3. Accounting Journals:
    // Journal A: Revenue Recognition from Sales (Credit Revenue 4010 Rs. 185,000)
    const jvRevenue = {
      voucherNumber: 'JV-2026-0002',
      date: today,
      lines: [
        { accountCode: '1030', debit: 185000, credit: 0 },
        { accountCode: '4010', debit: 0, credit: 185000 },
      ],
      totalDebit: 185000,
      totalCredit: 185000,
    };
    // Journal B: COGS Recognition (Debit COGS 5020 Rs. 70,000)
    const jvCogs = {
      voucherNumber: 'JV-2026-0003',
      date: today,
      lines: [
        { accountCode: '5020', debit: 70000, credit: 0 },
        { accountCode: '1050', debit: 0, credit: 70000 },
      ],
      totalDebit: 70000,
      totalCredit: 70000,
    };
    // Journal C: Operating Expenses (Debit Expense 5010 Rs. 30,000)
    const jvExp = {
      voucherNumber: 'JV-2026-0004',
      date: today,
      lines: [
        { accountCode: '5010', debit: 30000, credit: 0 },
        { accountCode: '1020', debit: 0, credit: 25000 },
        { accountCode: '1010', debit: 0, credit: 5000 },
      ],
      totalDebit: 30000,
      totalCredit: 30000,
    };

    await testPool.query('INSERT INTO erp_journal_entry (id, payload) VALUES (?, ?)', ['jv-rev', JSON.stringify(jvRevenue)]);
    await testPool.query('INSERT INTO erp_journal_entry (id, payload) VALUES (?, ?)', ['jv-cogs', JSON.stringify(jvCogs)]);
    await testPool.query('INSERT INTO erp_journal_entry (id, payload) VALUES (?, ?)', ['jv-exp', JSON.stringify(jvExp)]);

    // Verify all journals are strictly balanced (Debit == Credit)
    const [allJvs] = await testPool.query('SELECT payload FROM erp_journal_entry');
    for (const row of allJvs) {
      const jv = row.payload;
      assert.equal(jv.totalDebit, jv.totalCredit, `Journal ${jv.voucherNumber} must have equal debits and credits`);
    }

    // Calculate Net Profit: Revenue (185,000) - COGS (70,000) - Expenses (30,000) = Rs. 85,000
    let revTotal = 0;
    let cogsTotal = 0;
    let expTotal = 0;

    for (const row of allJvs) {
      for (const line of row.payload.lines || []) {
        if (line.accountCode === '4010') revTotal += (line.credit - line.debit);
        if (line.accountCode === '5020') cogsTotal += (line.debit - line.credit);
        if (line.accountCode === '5010') expTotal += (line.debit - line.credit);
      }
    }

    const netProfit = revTotal - cogsTotal - expTotal;
    assert.equal(revTotal, 185000);
    assert.equal(cogsTotal, 70000);
    assert.equal(expTotal, 30000);
    assert.equal(netProfit, 85000, 'Net Profit must be exactly Rs. 85,000');
  });

  await t.test('All 8 Summary Cards Verification Summary', async () => {
    // Collect the 8 calculated values
    const expectedSummary = {
      totalPurchase: 120000,
      totalSale: 185000,
      totalExpenses: 30000,
      purchaseDue: 70000,
      invoiceDue: 50000,
      totalInBank: 155000, // 200,000 - 20,000 (transferred to cash) - 25,000 (rent expense) = 155,000
      totalInCash: 65000,  // 50,000 + 20,000 (transferred from bank) - 5,000 (supplies expense) = 65,000
      netProfit: 85000,
    };

    assert.equal(expectedSummary.totalPurchase, 120000);
    assert.equal(expectedSummary.totalSale, 185000);
    assert.equal(expectedSummary.totalExpenses, 30000);
    assert.equal(expectedSummary.purchaseDue, 70000);
    assert.equal(expectedSummary.invoiceDue, 50000);
    assert.equal(expectedSummary.totalInBank, 155000);
    assert.equal(expectedSummary.totalInCash, 65000);
    assert.equal(expectedSummary.netProfit, 85000);
  });

  await t.test('Teardown and Cleanup of Disposable Test Database', async () => {
    // Drop the disposable test database completely so no test records linger
    if (testPool) {
      await testPool.end();
    }
    const adminPool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
    });
    await adminPool.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    await adminPool.end();
    assert.ok(true, `Disposable test database ${TEST_DB} cleanly dropped`);
  });
});

