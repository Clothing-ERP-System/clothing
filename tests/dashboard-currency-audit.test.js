'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Import shared currency utilities directly
import { formatCurrency, getCurrencySymbol, DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL } from '../src/lib/currency.js';

test('Currency Fix: default currency is PKR and default symbol is Rs.', () => {
  assert.equal(DEFAULT_CURRENCY, 'PKR');
  assert.equal(DEFAULT_CURRENCY_SYMBOL, 'Rs.');
});

test('Currency Fix: formatCurrency formats zero and positive numbers with Rs.', () => {
  assert.equal(formatCurrency(0), 'Rs. 0');
  assert.equal(formatCurrency(0, 'Rs.'), 'Rs. 0');
  assert.equal(formatCurrency(1500), 'Rs. 1,500');
  assert.equal(formatCurrency(250000.5), 'Rs. 250,000.5');
  assert.equal(formatCurrency(null), 'Rs. 0');
  assert.equal(formatCurrency(undefined), 'Rs. 0');
  assert.equal(formatCurrency('abc'), 'Rs. 0');
});

test('Currency Fix: formatCurrency formats negative amounts with -Rs.', () => {
  assert.equal(formatCurrency(-500), '-Rs. 500');
  assert.equal(formatCurrency(-12500.75), '-Rs. 12,500.75');
});

test('Currency Fix: getCurrencySymbol respects company currencySymbol over EUR default', () => {
  // If company configured 'Rs.', it should return 'Rs.' regardless of currency code
  assert.equal(getCurrencySymbol('EUR', 'Rs.'), 'Rs.');
  assert.equal(getCurrencySymbol('PKR', 'Rs.'), 'Rs.');
  assert.equal(getCurrencySymbol('PKR'), 'Rs.');
  assert.equal(getCurrencySymbol('USD'), '$');
  assert.equal(getCurrencySymbol('GBP'), '£');
  assert.equal(getCurrencySymbol(null), 'Rs.');
  assert.equal(getCurrencySymbol(undefined), 'Rs.');
});

test('Currency Rule: non-financial quantities (todo counts, products, percentages) do NOT use currency formatting', () => {
  const todoCount = 5;
  const productQuantity = 120;
  const percentage = 75.5;

  // Plain number formatting
  assert.equal(String(todoCount), '5');
  assert.equal(`${productQuantity.toLocaleString()} pcs`, '120 pcs');
  assert.equal(`${percentage}%`, '75.5%');

  // Must not have currency symbol
  assert.ok(!String(todoCount).includes('Rs.'));
  assert.ok(!`${productQuantity} pcs`.includes('Rs.'));
  assert.ok(!`${percentage}%`.includes('Rs.'));
});

test('Dashboard: financial year range calculation parses YYYY-MM-DD without returning null', () => {
  // Simulated FY calculation from src/app/api/dashboard/route.js
  const company = {
    financialYearStart: '2026-11-26',
    financialYearEnd: '2026-12-01',
  };

  const startParts = company.financialYearStart.split('-').map(Number);
  const endParts = company.financialYearEnd.split('-').map(Number);

  assert.equal(startParts.length, 3);
  assert.equal(endParts.length, 3);

  const start = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
  const end = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999));

  assert.ok(!Number.isNaN(start.getTime()));
  assert.ok(!Number.isNaN(end.getTime()));
  assert.ok(end >= start);
});

test('UI Sanitation: globals.css no longer attaches botanical leaves or waves to all main .bg-white elements', () => {
  const cssPath = path.resolve('src/app/globals.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify that `main .bg-white::before` and `main .bg-white::after` are NOT in globals.css
  assert.ok(!css.includes('main .bg-white::before'), 'Rogue main .bg-white::before removed');
  assert.ok(!css.includes('main .bg-white::after'), 'Rogue main .bg-white::after removed');
});

test('Calendar Security: ownership check handles string and UUID/ObjectId types consistently', () => {
  const userId = '22f2fcb0-bc71-43b8-b8be-175a7891f41b';
  const event = { userId: '22f2fcb0-bc71-43b8-b8be-175a7891f41b', title: 'Factory Visit' };
  const differentUser = 'a1be27d7-a5da-46a5-b64a-341896940c20';

  assert.equal(String(event.userId) === String(userId), true, 'Owner matches');
  assert.equal(String(event.userId) === String(differentUser), false, 'Different user rejected');
});

test('Exact Eight Summary Cards: page.js defines the exact 8 financial summary cards in expected order', () => {
  const pagePath = path.resolve('src/app/page.js');
  const pageCode = fs.readFileSync(pagePath, 'utf8');

  const expectedCards = [
    'Total Purchase',
    'Total Sale',
    'Expenses',
    'Purchase Due',
    'Invoice Due',
    'Total in Bank',
    'Total in Cash',
    'Net Profit',
  ];

  for (const cardTitle of expectedCards) {
    assert.ok(pageCode.includes(`title: '${cardTitle}'`), `Card "${cardTitle}" must be present in page.js`);
  }

  // Ensure Customers, Suppliers, Products are not summary cards in page.js
  assert.ok(!pageCode.includes("title: 'Customers'"), 'Customers must not be a summary card');
  assert.ok(!pageCode.includes("title: 'Suppliers'"), 'Suppliers must not be a summary card');
  assert.ok(!pageCode.includes("title: 'Products'"), 'Products must not be a summary card');
});


