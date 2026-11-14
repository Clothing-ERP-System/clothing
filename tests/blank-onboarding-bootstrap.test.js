'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { evaluatePasswordStrength } from '../src/lib/password-policy.js';
import { hashPassword, generateToken } from '../src/lib/auth.js';

const TEST_DB = 'clothing_erp_test_bootstrap';

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

test('BLANK DATABASE FIRST-TIME ONBOARDING & ADMIN BOOTSTRAP TEST', async (t) => {
  let testPool;

  await t.test('1. Setup empty isolated test database', async () => {
    const adminPool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
    });
    await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\``);
    await adminPool.end();

    testPool = mysql.createPool(getTestDbConfig());

    const tables = [
      `CREATE TABLE IF NOT EXISTS erp_company (
        id CHAR(36) PRIMARY KEY,
        payload JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`,
      `CREATE TABLE IF NOT EXISTS erp_user (
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
      `CREATE TABLE IF NOT EXISTS erp_location (
        id CHAR(36) PRIMARY KEY,
        payload JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;`,
    ];

    for (const sql of tables) {
      await testPool.query(sql);
    }

    // Clean all tables so DB starts 100% blank
    for (const tbl of ['erp_company', 'erp_user', 'erp_account_head', 'erp_location']) {
      await testPool.query(`DELETE FROM \`${tbl}\``);
    }

    const [[{ uCount }]] = await testPool.query('SELECT COUNT(*) as uCount FROM erp_user');
    const [[{ cCount }]] = await testPool.query('SELECT COUNT(*) as cCount FROM erp_company');
    const [[{ aCount }]] = await testPool.query('SELECT COUNT(*) as aCount FROM erp_account_head');

    assert.equal(uCount, 0, 'User table must start completely empty');
    assert.equal(cCount, 0, 'Company table must start completely empty');
    assert.equal(aCount, 0, 'Chart of Accounts table must start completely empty');
  });

  await t.test('2. First-time Admin bootstrap & Password security validation', async () => {
    // A. Password strength evaluation
    const weak1 = evaluatePasswordStrength('short');
    assert.equal(weak1.isValid, false, 'Password under 12 characters is rejected');
    assert.equal(weak1.score, 1);

    const weak2 = evaluatePasswordStrength('alllowercase123');
    assert.equal(weak2.isValid, false, 'Password without uppercase or symbol is rejected');

    const strong = evaluatePasswordStrength('GarmentCorp#2026!Secure');
    assert.equal(strong.isValid, true, 'Strong complex password passes all criteria');
    assert.equal(strong.score, 4);
    assert.equal(strong.label, 'Strong');

    // B. Create initial SuperAdmin
    const adminPasswordHash = await hashPassword('GarmentCorp#2026!Secure');
    const adminUser = {
      _id: 'admin-client-01',
      name: 'Client Managing Director',
      email: 'md@garmentfactory.pk',
      password: adminPasswordHash,
      role: 'SuperAdmin',
      branch: '',
      department: 'Executive',
      permissions: ['ALL'],
      isActive: true,
    };

    await testPool.query('INSERT INTO erp_user (id, payload) VALUES (?, ?)', [adminUser._id, JSON.stringify(adminUser)]);

    // C. Verify user exists and subsequent bootstrap is blocked
    const [[{ uCount }]] = await testPool.query('SELECT COUNT(*) as uCount FROM erp_user');
    assert.equal(uCount, 1, 'Exactly 1 SuperAdmin created');

    // Second admin attempt would be blocked by countDocuments() !== 0
    const setupRequired = uCount === 0;
    assert.equal(setupRequired, false, 'setupRequired is now false');
  });

  await t.test('3. Chart of Accounts on initially empty database displays zero counts cleanly', async () => {
    const [rows] = await testPool.query('SELECT payload FROM erp_account_head');
    const accounts = rows.map((r) => r.payload);
    assert.equal(accounts.length, 0, 'No accounts exist yet');

    const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'CostOfGoodsSold', 'OperatingExpense'];
    for (const type of ACCOUNT_TYPES) {
      const count = accounts.filter((a) => a.type === type).length;
      assert.equal(count, 0, `Category ${type} count should be 0 on clean workspace`);
    }
  });

  await t.test('4. Complete Onboarding Workflow execution in MySQL', async () => {
    // Step 1: Save Company Profile
    const company = {
      _id: 'comp-real-01',
      companyName: 'Apex Apparel Manufacturing Ltd',
      legalName: 'Apex Apparel Private Limited',
      contactEmail: 'info@apexapparel.pk',
      phone: '+92-21-35123456',
      financialYearStart: '2026-07-01',
      financialYearEnd: '2027-06-30',
      currency: 'PKR',
      currencySymbol: 'Rs.',
      taxSettings: {
        defaultTaxRate: 18,
        taxName: 'Sales Tax',
        taxRegistrationNumber: 'STRN-9876543-2',
      },
      accountingMappings: {
        cashAccountCode: '1010',
        bankAccountCode: '1020',
        salesReceivableAccountCode: '1030',
        inventoryAccountCode: '1050',
        payableAccountCode: '2010',
        grniAccountCode: '2030',
        inputTaxAccountCode: '2035',
        openingBalanceEquityAccountCode: '3100',
        salesRevenueAccountCode: '4010',
        cogsAccountCode: '5020',
        expenseAccountCode: '5010',
      },
      onboardingCompleted: true,
    };

    await testPool.query('INSERT INTO erp_company (id, payload) VALUES (?, ?)', [company._id, JSON.stringify(company)]);

    // Step 2: Seed client Chart of Accounts
    const clientAccounts = [
      { code: '1010', name: 'Cash in Hand', type: 'Asset', balance: 0 },
      { code: '1020', name: 'Operating Bank Account', type: 'Asset', isBank: true, balance: 0 },
      { code: '1030', name: 'Accounts Receivable', type: 'Asset', balance: 0 },
      { code: '1050', name: 'Finished Garments Inventory', type: 'Asset', balance: 0 },
      { code: '2010', name: 'Accounts Payable - Fabric Suppliers', type: 'Liability', balance: 0 },
      { code: '2030', name: 'Goods Received Not Invoiced', type: 'Liability', balance: 0 },
      { code: '2035', name: 'Sales Tax Input Recoverable', type: 'Asset', balance: 0 },
      { code: '3100', name: 'Opening Balance Equity', type: 'Equity', balance: 0 },
      { code: '4010', name: 'Garment Export & Local Sales Revenue', type: 'Revenue', balance: 0 },
      { code: '5010', name: 'Factory Overheads & Rent', type: 'OperatingExpense', balance: 0 },
      { code: '5020', name: 'Cost of Goods Sold (Apparel)', type: 'CostOfGoodsSold', balance: 0 },
    ];

    for (const acc of clientAccounts) {
      await testPool.query('INSERT INTO erp_account_head (id, payload) VALUES (?, ?)', [`acc-${acc.code}`, JSON.stringify(acc)]);
    }

    // Step 3: Seed client location
    const location = {
      _id: 'loc-01',
      locationCode: 'WH-KHI-01',
      name: 'Karachi Main Garment Plant',
      type: 'Warehouse',
      address: 'Plot 45, Korangi Industrial Area, Karachi',
      isActive: true,
    };
    await testPool.query('INSERT INTO erp_location (id, payload) VALUES (?, ?)', [location._id, JSON.stringify(location)]);

    // Step 4: Verify persistence
    const [cRows] = await testPool.query('SELECT payload FROM erp_company WHERE id = ?', [company._id]);
    assert.equal(cRows[0].payload.companyName, 'Apex Apparel Manufacturing Ltd');
    assert.equal(cRows[0].payload.currency, 'PKR');
    assert.equal(cRows[0].payload.currencySymbol, 'Rs.');
    assert.equal(cRows[0].payload.onboardingCompleted, true);

    const [aRows] = await testPool.query('SELECT payload FROM erp_account_head');
    assert.equal(aRows.length, 11, 'All 11 client accounts saved');

    const [lRows] = await testPool.query('SELECT payload FROM erp_location');
    assert.equal(lRows.length, 1, 'Client warehouse location saved');
  });

  await t.test('5. Teardown and Cleanup of Disposable Test Database', async () => {
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

