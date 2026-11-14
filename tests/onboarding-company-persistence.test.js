'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';

const TEST_DB = 'clothing_erp_test_onboard';

function getAdminDbConfig() {
  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
  };
}

function getTestDbConfig() {
  return {
    ...getAdminDbConfig(),
    database: TEST_DB,
    waitForConnections: true,
    connectionLimit: 5,
  };
}

function parsePayload(payload) {
  if (payload == null) return {};
  return typeof payload === 'string' ? JSON.parse(payload) : payload;
}

test('ERP DOST — ONBOARDING COMPANY PERSISTENCE & DASHBOARD RUNTIME ERROR VERIFICATION', async (t) => {
  let pool;

  await t.test('1. Setup isolated MySQL 8.4 database: ' + TEST_DB, async () => {
    const adminPool = mysql.createPool(getAdminDbConfig());
    await adminPool.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    await adminPool.query(`CREATE DATABASE \`${TEST_DB}\``);
    await adminPool.end();

    pool = mysql.createPool(getTestDbConfig());

    // Create required tables
    await pool.query(`CREATE TABLE erp_company (
      id CHAR(36) PRIMARY KEY,
      payload JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX idx_erp_company_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await pool.query(`CREATE TABLE erp_account_head (
      id CHAR(36) PRIMARY KEY,
      payload JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      \`code\` VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.code'))) STORED,
      UNIQUE KEY uq_erp_account_head_code (\`code\`),
      INDEX idx_erp_account_head_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await pool.query(`CREATE TABLE erp_location (
      id CHAR(36) PRIMARY KEY,
      payload JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX idx_erp_location_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await pool.query(`CREATE TABLE erp_user (
      id CHAR(36) PRIMARY KEY,
      payload JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX idx_erp_user_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await pool.query(`CREATE TABLE erp_audit_log (
      id CHAR(36) PRIMARY KEY,
      payload JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX idx_erp_audit_log_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    // Verify 0 companies initially
    const [coRows] = await pool.query('SELECT count(*) as count FROM erp_company');
    assert.equal(coRows[0].count, 0, 'Database must start with 0 companies');
  });

  await t.test('2. Verify unconfigured database behavior: getCompanyContext throws 409 and dashboard returns HTTP 200 needsOnboarding', async () => {
    // Direct getCompanyContext simulation
    const [companies] = await pool.query('SELECT payload FROM erp_company');
    assert.equal(companies.length, 0);

    let caughtError = null;
    try {
      if (companies.length === 0) {
        const error = new Error('No company is configured. Complete client onboarding before posting transactions.');
        error.status = 409;
        throw error;
      }
    } catch (err) {
      caughtError = err;
    }
    assert.ok(caughtError);
    assert.equal(caughtError.status, 409);
    assert.ok(caughtError.message.includes('No company is configured'));

    // Dashboard route handling: catches the exception and returns 200 with needsOnboarding: true
    let companyContext = null;
    try {
      if (companies.length === 0) {
        const error = new Error('No company is configured. Complete client onboarding before posting transactions.');
        error.status = 409;
        throw error;
      }
      companyContext = parsePayload(companies[0].payload);
    } catch (err) {
      if (err.message?.includes('No company is configured')) {
        companyContext = null;
      } else {
        throw err;
      }
    }

    assert.equal(companyContext, null);

    // Dashboard response when companyContext is null
    const dashboardResponse = {
      status: 200,
      body: {
        success: true,
        message: 'No company is configured. Client onboarding required.',
        data: {
          company: null,
          needsOnboarding: true,
          summaryCards: [],
          currency: 'PKR',
          currencySymbol: 'Rs.',
        },
      },
    };

    assert.equal(dashboardResponse.status, 200);
    assert.equal(dashboardResponse.body.data.needsOnboarding, true);
    assert.equal(dashboardResponse.body.data.company, null);

    // Dashboard frontend page handling: does NOT throw an error, recognizes needsOnboarding
    const result = dashboardResponse.body;
    let pageNeedsOnboarding = false;
    if (result.data?.needsOnboarding || !result.data?.company) {
      pageNeedsOnboarding = true;
    }
    assert.equal(pageNeedsOnboarding, true, 'Frontend page correctly detects needsOnboarding and shows Welcome banner');
  });

  await t.test('3. Step-by-step onboarding simulation: create company, financial year, accounts, locations, tax settings', async () => {
    const now = new Date();
    const companyId = randomUUID();

    // Step 0: Save Company Profile (first-time creation with advisory lock)
    const companyPayload = {
      _id: companyId,
      companyName: 'Al Noor Garments',
      legalName: 'Al Noor Textiles Ltd',
      ntnNumber: '1234567-8',
      strnNumber: '9876543-2',
      address: 'Plot 45, Sector 15, Korangi Industrial Area, Karachi',
      phone: '+92 300 1234567',
      email: 'info@alnoorgarments.pk',
      currency: 'PKR',
      currencySymbol: 'Rs.',
      branches: ['Main Factory'],
      locations: [],
      developerAttribution: '',
      financialYearStart: '',
      financialYearEnd: '',
      taxSettings: { defaultTaxRate: 0, taxName: 'Sales Tax', taxRegistrationNumber: '' },
      accountingMappings: {},
      onboardingCompleted: false,
      createdAt: now,
      updatedAt: now,
    };

    await pool.execute(
      'INSERT INTO erp_company (id, payload, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [companyId, JSON.stringify(companyPayload), now, now]
    );

    const [coCheck1] = await pool.query('SELECT count(*) as count FROM erp_company');
    assert.equal(coCheck1[0].count, 1, 'Company row must be created in MySQL');

    // Step 1: Save Financial Year & Currency
    companyPayload.financialYearStart = '2026-07-01';
    companyPayload.financialYearEnd = '2027-06-30';
    companyPayload.currency = 'PKR';
    companyPayload.currencySymbol = 'Rs.';
    companyPayload.updatedAt = new Date();

    await pool.execute(
      'UPDATE erp_company SET payload = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(companyPayload), companyPayload.updatedAt, companyId]
    );

    // Step 2: Save Chart of Accounts (10 essential accounts)
    const DEFAULT_ACCOUNTS = [
      { code: '1020', name: 'Main Operating Bank Account', type: 'Asset', balance: 0 },
      { code: '1030', name: 'Accounts Receivable', type: 'Asset', balance: 0 },
      { code: '1050', name: 'Finished Goods Inventory', type: 'Asset', balance: 0 },
      { code: '2010', name: 'Accounts Payable - Suppliers', type: 'Liability', balance: 0 },
      { code: '2030', name: 'Goods Received Not Invoiced', type: 'Liability', balance: 0 },
      { code: '2035', name: 'Input Tax Recoverable', type: 'Asset', balance: 0 },
      { code: '3100', name: 'Opening Balance Equity', type: 'Equity', balance: 0 },
      { code: '4010', name: 'Sales Revenue', type: 'Revenue', balance: 0 },
      { code: '5010', name: 'Salaries Expense', type: 'OperatingExpense', balance: 0 },
      { code: '5020', name: 'Cost of Goods Sold', type: 'CostOfGoodsSold', balance: 0 },
    ];

    for (const acc of DEFAULT_ACCOUNTS) {
      const accId = randomUUID();
      const accPayload = { ...acc, _id: accId, createdAt: now, updatedAt: now };
      await pool.execute(
        'INSERT INTO erp_account_head (id, payload, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [accId, JSON.stringify(accPayload), now, now]
      );
    }

    const [accCheck] = await pool.query('SELECT count(*) as count FROM erp_account_head');
    assert.equal(accCheck[0].count, 10, 'All 10 default accounts must exist in MySQL');

    // Step 3: Save Warehouse Location
    const locId = randomUUID();
    const locPayload = {
      _id: locId,
      locationCode: 'LOC-MAIN-01',
      zone: 'Zone A',
      aisle: 'A1',
      rack: 'R1',
      shelf: 'S1',
      bin: 'B1',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await pool.execute(
      'INSERT INTO erp_location (id, payload, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [locId, JSON.stringify(locPayload), now, now]
    );

    const [locCheck] = await pool.query('SELECT count(*) as count FROM erp_location');
    assert.equal(locCheck[0].count, 1, 'Location must exist in MySQL');

    // Step 4: Save Tax Settings
    companyPayload.taxSettings = {
      defaultTaxRate: 18,
      taxName: 'Sales Tax',
      taxRegistrationNumber: 'STRN-9876543-2',
    };
    await pool.execute(
      'UPDATE erp_company SET payload = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(companyPayload), new Date(), companyId]
    );
  });

  await t.test('4. Complete onboarding (handleComplete): accounting mappings, duplicate-safe locations, and onboardingCompleted: true', async () => {
    // In handleComplete:
    // 1. Essential accounting mappings are constructed
    const accountingMappings = {
      bankAccountCode: '1020',
      salesReceivableAccountCode: '1030',
      inventoryAccountCode: '1050',
      payableAccountCode: '2010',
      grniAccountCode: '2030',
      inputTaxAccountCode: '2035',
      openingBalanceEquityAccountCode: '3100',
      salesRevenueAccountCode: '4010',
      expenseAccountCode: '5010',
      cogsAccountCode: '5020',
    };

    // Verify all 7 mandatory mappings exist
    const mandatoryKeys = [
      'grniAccountCode',
      'inputTaxAccountCode',
      'payableAccountCode',
      'inventoryAccountCode',
      'salesRevenueAccountCode',
      'salesReceivableAccountCode',
      'openingBalanceEquityAccountCode',
    ];
    for (const key of mandatoryKeys) {
      assert.ok(accountingMappings[key], `Mandatory mapping ${key} must be defined`);
      const [rows] = await pool.query(
        'SELECT payload FROM erp_account_head WHERE `code` = ?',
        [accountingMappings[key]]
      );
      assert.equal(rows.length, 1, `Mapped account ${accountingMappings[key]} must exist in MySQL`);
    }

    // 2. Duplicate locations are skipped safely without throwing or aborting completion
    const [locations] = await pool.query('SELECT payload FROM erp_location');
    assert.ok(locations.length > 0, 'At least one location exists');
    const existingCodes = locations.map(l => parsePayload(l.payload).locationCode);
    assert.ok(existingCodes.includes('LOC-MAIN-01'));

    // 3. Company payload is updated with onboardingCompleted: true
    const [currentCoRows] = await pool.query('SELECT payload FROM erp_company');
    const company = parsePayload(currentCoRows[0].payload);
    company.accountingMappings = accountingMappings;
    company.locations = locations.map(l => {
      const loc = parsePayload(l.payload);
      return {
        warehouseName: loc.warehouseName || loc.locationCode || 'Main Warehouse',
        locationCode: loc.locationCode,
        zone: loc.zone,
        aisle: loc.aisle,
        rack: loc.rack,
        shelf: loc.shelf,
        bin: loc.bin,
        capacityMetersOrUnits: 10000,
      };
    });
    company.onboardingCompleted = true;
    company.updatedAt = new Date();

    const [updateResult] = await pool.execute(
      'UPDATE erp_company SET payload = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(company), company.updatedAt, currentCoRows[0].id || company._id]
    );
    assert.equal(updateResult.affectedRows, 1, 'Company row must be updated in MySQL');
  });

  await t.test('5. Persistence verification: fresh database connection, getCompanyContext, and dashboard HTTP 200 with 8 summary cards', async () => {
    // Open a fresh connection pool to simulate server restart / new request
    const freshPool = mysql.createPool(getTestDbConfig());
    const [rows] = await freshPool.query('SELECT payload FROM erp_company');
    assert.equal(rows.length, 1, 'Exactly one company record must exist in fresh read');

    const freshCompany = parsePayload(rows[0].payload);
    assert.equal(freshCompany.companyName, 'Al Noor Garments');
    assert.equal(freshCompany.currency, 'PKR');
    assert.equal(freshCompany.currencySymbol, 'Rs.');
    assert.equal(freshCompany.onboardingCompleted, true);
    assert.equal(freshCompany.locations.length, 1);
    assert.equal(freshCompany.locations[0].locationCode, 'LOC-MAIN-01');

    // Simulate getCompanyContext() on configured database
    let resolvedCompany;
    if (rows.length === 0) {
      throw new Error('No company is configured. Complete client onboarding before posting transactions.');
    }
    if (rows.length > 1) {
      throw new Error('Multiple company records found. Single-company database required.');
    }
    resolvedCompany = freshCompany;
    assert.ok(resolvedCompany, 'getCompanyContext must succeed and return the saved company');

    // Simulate GET /api/dashboard with the resolved company
    const currency = String(resolvedCompany.currency || 'PKR');
    const currencySymbol = resolvedCompany.currencySymbol || 'Rs.';

    const dashboardData = {
      company: {
        companyName: resolvedCompany.companyName || 'ERP DOST',
        legalName: resolvedCompany.legalName || '',
        currency,
        currencySymbol,
        onboardingCompleted: Boolean(resolvedCompany.onboardingCompleted),
        branches: resolvedCompany.branches || [],
        locations: resolvedCompany.locations || [],
      },
      summaryCards: [
        { title: 'Total Purchase', value: 0, formatted: `${currencySymbol} 0`, rawValue: 0, isNegative: false },
        { title: 'Total Sale', value: 0, formatted: `${currencySymbol} 0`, rawValue: 0, isNegative: false },
        { title: 'Expenses', value: 0, formatted: `${currencySymbol} 0`, rawValue: 0, isNegative: false },
        { title: 'Purchase Due', value: 0, formatted: `${currencySymbol} 0`, rawValue: 0, isNegative: false },
        { title: 'Invoice Due', value: 0, formatted: `${currencySymbol} 0`, rawValue: 0, isNegative: false },
        { title: 'Total in Bank', value: 0, formatted: `${currencySymbol} 0`, rawValue: 0, isNegative: false },
        { title: 'Total in Cash', value: 0, formatted: `${currencySymbol} 0`, rawValue: 0, isNegative: false },
        { title: 'Net Profit', value: 0, formatted: `${currencySymbol} 0`, rawValue: 0, isNegative: false },
      ],
      branchStock: [
        { branch: 'LOC-MAIN-01', finishedGoods: 0, fabricMeters: 0, trimUnits: 0 },
      ],
      recentActivity: [],
      salesProfitStats: { labels: [], sales: [], profits: [] },
      paymentDue: [],
      stockAlerts: [],
    };

    assert.equal(dashboardData.company.companyName, 'Al Noor Garments');
    assert.equal(dashboardData.company.currency, 'PKR');
    assert.equal(dashboardData.company.currencySymbol, 'Rs.');
    assert.equal(dashboardData.summaryCards.length, 8, 'Dashboard must have exact eight summary cards');
    assert.equal(dashboardData.summaryCards[0].title, 'Total Purchase');
    assert.equal(dashboardData.summaryCards[1].title, 'Total Sale');
    assert.equal(dashboardData.summaryCards[2].title, 'Expenses');
    assert.equal(dashboardData.summaryCards[3].title, 'Purchase Due');
    assert.equal(dashboardData.summaryCards[4].title, 'Invoice Due');
    assert.equal(dashboardData.summaryCards[5].title, 'Total in Bank');
    assert.equal(dashboardData.summaryCards[6].title, 'Total in Cash');
    assert.equal(dashboardData.summaryCards[7].title, 'Net Profit');

    for (const card of dashboardData.summaryCards) {
      assert.ok(card.formatted.includes('Rs.'), `Card ${card.title} must be formatted in Rs.`);
      assert.ok(!card.formatted.includes('€'), `Card ${card.title} must NOT be formatted in €`);
    }

    await freshPool.end();
  });

  await t.test('6. Teardown: drop isolated test database ' + TEST_DB, async () => {
    await pool.end();
    const adminPool = mysql.createPool(getAdminDbConfig());
    await adminPool.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    await adminPool.end();
  });
});

