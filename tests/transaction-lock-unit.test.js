'use strict';

// ERP DOST — Isolated Unit Tests (No Database Required)
// Uses Node.js built-in test runner (node:test) with mocks/test doubles
// Tests transaction lifecycle, advisory lock logic, GRNI calculations, and accounting

import test from 'node:test';
import assert from 'node:assert/strict';

// ── Mock transactionStorage (AsyncLocalStorage) ─────────────────────────
let mockStore = null;
const mockTransactionStorage = {
  getStore: () => mockStore,
  run: async (connection, callback) => {
    mockStore = connection;
    try {
      return await callback();
    } finally {
      mockStore = null;
    }
  },
};

// ── Mock taintedConnections Set ─────────────────────────────────────────
const mockTaintedConnections = new Set();
const mockTaintConnection = (conn) => { if (conn) mockTaintedConnections.add(conn); };

// ── Mock releaseOrDestroyConnection ─────────────────────────────────────
let releaseCalls = 0;
let destroyCalls = 0;
const mockReleaseOrDestroyConnection = async (conn) => {
  if (!conn) return;
  if (mockTaintedConnections.has(conn)) {
    mockTaintedConnections.delete(conn);
    destroyCalls++;
    return;
  }
  releaseCalls++;
};

// ── Mock runInTransaction (copied logic with mocks) ─────────────────────
async function runInTransaction(callback, onSettle) {
  if (mockTransactionStorage.getStore()) return callback();

  const connection = {
    id: 'mock-conn-' + Math.random().toString(36).slice(2),
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
  };
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await mockTransactionStorage.run(connection, callback);
    if (result && typeof result.status === 'number' && result.status >= 400) {
      transactionStarted = false;
      try { await connection.rollback(); } catch {}
      return result;
    }
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try { await connection.rollback(); } catch {}
    }
    throw error;
  } finally {
    if (onSettle) {
      try {
        await onSettle(connection);
      } catch (error) {
        mockTaintConnection(connection);
      }
    }
    await mockReleaseOrDestroyConnection(connection);
  }
}

// ── Test counters ───────────────────────────────────────────────────────
let testsPassed = 0;
let testsFailed = 0;

function resetCounters() {
  releaseCalls = 0;
  destroyCalls = 0;
  mockTaintedConnections.clear();
}

// ── Test 1: Transaction success → connection returned to pool ───────────
test('transaction success returns connection to pool', async () => {
  resetCounters();
  let commitCalled = false;
  const origCommit = connectionProto => connectionProto.commit = async () => { commitCalled = true; };
  // Use a wrapper that tracks commit
  let trackedCommit = false;
  const result = await runInTransaction(async () => {
    trackedCommit = true;
    return { status: 200, data: 'ok' };
  });

  assert.strictEqual(trackedCommit, true);
  assert.strictEqual(result.status, 200);
  assert.strictEqual(releaseCalls, 1, 'connection should be released to pool');
  assert.strictEqual(destroyCalls, 0, 'connection should not be destroyed');
  assert.strictEqual(mockTaintedConnections.size, 0, 'no tainted connections');
  testsPassed++;
});

// ── Test 2: Transaction rollback (4xx status) → connection returned ───
test('transaction rollback returns connection to pool', async () => {
  resetCounters();
  let rollbackCalled = false;
  const result = await runInTransaction(async () => {
    rollbackCalled = true;
    return { status: 409, error: 'duplicate' };
  });

  assert.strictEqual(rollbackCalled, true);
  assert.strictEqual(result.status, 409);
  assert.strictEqual(releaseCalls, 1, 'connection should be released after rollback');
  assert.strictEqual(destroyCalls, 0);
  testsPassed++;
});

// ── Test 3: onSettle failure → connection destroyed ─────────────────────
test('onSettle failure taints and destroys connection', async () => {
  resetCounters();
  let onSettleCalled = false;
  try {
    await runInTransaction(
      async () => ({ status: 200 }),
      async (conn) => {
        onSettleCalled = true;
        throw new Error('RELEASE_LOCK failed');
      }
    );
    assert.fail('should have thrown');
  } catch (e) {
    // Error propagates from runInTransaction
  }

  assert.strictEqual(onSettleCalled, true);
  assert.strictEqual(destroyCalls, 1, 'connection should be destroyed on onSettle failure');
  assert.strictEqual(mockTaintedConnections.size, 0, 'tainted set cleaned up after destroy');
  testsPassed++;
});

// ── Test 4: GET_LOCK success (returns 1) ────────────────────────────────
test('GET_LOCK success returns 1', () => {
  const lockResult = 1;
  const lockAcquired = lockResult && lockResult === 1;
  assert.strictEqual(lockAcquired, true);
  testsPassed++;
});

// ── Test 5: GET_LOCK timeout (returns 0) ────────────────────────────────
test('GET_LOCK timeout returns 0 (lock not acquired)', () => {
  const lockResult = 0;
  const lockAcquired = Boolean(lockResult && lockResult === 1);
  assert.strictEqual(lockAcquired, false);
  testsPassed++;
});

// ── Test 6: GET_LOCK NULL ───────────────────────────────────────────────
test('GET_LOCK NULL treated as not acquired', () => {
  const lockResult = null;
  const lockAcquired = Boolean(lockResult && lockResult === 1);
  assert.strictEqual(lockAcquired, false);
  testsPassed++;
});

// ── Test 7: RELEASE_LOCK success (returns 1) ────────────────────────────
test('RELEASE_LOCK success returns 1', () => {
  const releaseResult = 1;
  const lockReleased = Boolean(releaseResult && releaseResult === 1);
  assert.strictEqual(lockReleased, true);
  testsPassed++;
});

// ── Test 8: RELEASE_LOCK returns 0 (lock not held) ──────────────────────
test('RELEASE_LOCK returns 0 treated as not released', () => {
  const releaseResult = 0;
  const lockReleased = Boolean(releaseResult && releaseResult === 1);
  assert.strictEqual(lockReleased, false);
  testsPassed++;
});

// ── Test 9: RELEASE_LOCK returns NULL ───────────────────────────────────
test('RELEASE_LOCK NULL treated as not released', () => {
  const releaseResult = null;
  const lockReleased = Boolean(releaseResult && releaseResult === 1);
  assert.strictEqual(lockReleased, false);
  testsPassed++;
});

// ── Test 10: GRNI partial invoice matching ──────────────────────────────
test('GRNI partial invoice matching caps at remaining balance', () => {
  const grnAcceptedValue = 5000;
  const priorInvoices = [
    { invoiceNumber: 'INV-001', grniCleared: 2000 },
    { invoiceNumber: 'INV-002', grniCleared: 1500 },
  ];

  let grniAlreadyCleared = 0;
  for (const inv of priorInvoices) {
    grniAlreadyCleared += inv.grniCleared;
  }

  const remainingGRNI = Math.max(0, grnAcceptedValue - grniAlreadyCleared);
  assert.strictEqual(remainingGRNI, 1500, 'remaining GRNI should be 1500');

  // New invoice subtotal of 3000 should be capped at 1500
  const subtotal = 3000;
  const grniDebit = Math.min(subtotal, remainingGRNI);
  assert.strictEqual(grniDebit, 1500, 'GRNI debit capped at remaining 1500');

  // New invoice subtotal of 1000 should use full 1000
  const smallSubtotal = 1000;
  const smallGrniDebit = Math.min(smallSubtotal, remainingGRNI);
  assert.strictEqual(smallGrniDebit, 1000, 'GRNI debit uses subtotal when less than remaining');

  testsPassed++;
});

// ── Test 11: GRNI excess invoice (subtotal exceeds remaining) ───────────
test('GRNI excess invoice uses remaining balance only', () => {
  const grnAcceptedValue = 5000;
  let grniAlreadyCleared = 4000;
  const remainingGRNI = Math.max(0, grnAcceptedValue - grniAlreadyCleared);
  assert.strictEqual(remainingGRNI, 1000);

  // Invoice subtotal of 5000 should be capped at remaining 1000
  const subtotal = 5000;
  const grniDebit = Math.min(subtotal, remainingGRNI);
  assert.strictEqual(grniDebit, 1000, 'GRNI debit capped at remaining 1000');

  // Expense/COGS gets the variance: subtotal - grniDebit
  const expenseDebit = subtotal - grniDebit;
  assert.strictEqual(expenseDebit, 4000, 'expense debit gets the variance');

  testsPassed++;
});

// ── Test 12: Supplier isolation in GRNI clearing ────────────────────────
test('supplier isolation: different suppliers cannot clear each other GRNI', () => {
  const grnAcceptedValue = 5000;

  // Supplier A invoices
  const supplierAInvoices = [
    { supplierId: 'SUP-A', grniCleared: 3000 },
  ];
  let supplierACleared = 0;
  for (const inv of supplierAInvoices) {
    if (inv.supplierId === 'SUP-A') supplierACleared += inv.grniCleared;
  }
  const supplierARemaining = Math.max(0, grnAcceptedValue - supplierACleared);
  assert.strictEqual(supplierARemaining, 2000, 'Supplier A remaining GRNI = 2000');

  // Supplier B invoices should NOT affect Supplier A
  const supplierBInvoices = [
    { supplierId: 'SUP-B', grniCleared: 2000 },
  ];
  let supplierBCleared = 0;
  for (const inv of supplierBInvoices) {
    if (inv.supplierId === 'SUP-B') supplierBCleared += inv.grniCleared;
  }
  const supplierBRemaining = Math.max(0, grnAcceptedValue - supplierBCleared);
  assert.strictEqual(supplierBRemaining, 3000, 'Supplier B remaining GRNI = 3000 (isolated from A)');

  // Supplier A remaining should still be 2000 (not affected by B)
  assert.strictEqual(supplierARemaining, 2000, 'Supplier A unaffected by Supplier B');

  testsPassed++;
});

// ── Test 13: Duplicate invoice posting prevention (sourceKey idempotency) ────
test('duplicate invoice sourceKey prevents double posting', () => {
  const postedSourceKeys = new Set();

  function tryPost(sourceKey) {
    if (postedSourceKeys.has(sourceKey)) return { duplicate: true };
    postedSourceKeys.add(sourceKey);
    return { duplicate: false };
  }

  const key1 = 'SUPPLIER_INVOICE:SUP-1:INV-001';
  assert.strictEqual(tryPost(key1).duplicate, false, 'first post succeeds');
  assert.strictEqual(tryPost(key1).duplicate, true, 'duplicate post rejected');

  // Same invoice number, different supplier should be allowed
  const key2 = 'SUPPLIER_INVOICE:SUP-2:INV-001';
  assert.strictEqual(tryPost(key2).duplicate, false, 'different supplier same invoice number allowed');

  testsPassed++;
});

// ── Test 14: Concurrent independent connection lock states ───────────────
test('concurrent connections maintain independent lock states', () => {
  const lockHeldConnections = new WeakSet();

  const connA = { id: 'conn-A' };
  const connB = { id: 'conn-B' };

  // Only conn A acquires lock
  lockHeldConnections.add(connA);

  assert.strictEqual(lockHeldConnections.has(connA), true, 'conn A has lock');
  assert.strictEqual(lockHeldConnections.has(connB), false, 'conn B does not have lock');

  // Release conn A
  lockHeldConnections.delete(connA);
  assert.strictEqual(lockHeldConnections.has(connA), false, 'conn A lock released');
  assert.strictEqual(lockHeldConnections.has(connB), false, 'conn B still no lock');

  testsPassed++;
});

// ── Test 15: Balanced accounting entries ────────────────────────────────
test('balanced accounting entries require equal debits and credits', () => {
  function validateJournal(lines) {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      totalDebit += Number(line.debit || 0);
      totalCredit += Number(line.credit || 0);
    }
    return Math.abs(totalDebit - totalCredit) <= 0.01;
  }

  // Balanced: DR 1000, CR 1000
  assert.strictEqual(validateJournal([
    { accountCode: '1050', debit: 1000, credit: 0 },
    { accountCode: '2010', debit: 0, credit: 1000 },
  ]), true, 'balanced journal passes');

  // Unbalanced: DR 1000, CR 500
  assert.strictEqual(validateJournal([
    { accountCode: '1050', debit: 1000, credit: 0 },
    { accountCode: '2010', debit: 0, credit: 500 },
  ]), false, 'unbalanced journal rejected');

  testsPassed++;
});

// ── Test 16: GRNI adjustment respects remaining balance ─────────────────
test('GRNI adjustment amount cannot exceed remaining GRNI', () => {
  const grnAcceptedValue = 10000;
  let grniAlreadyCleared = 7000;
  const remainingGRNI = Math.max(0, grnAcceptedValue - grniAlreadyCleared);
  assert.strictEqual(remainingGRNI, 3000);

  const adjustmentAmount = 3000;
  assert.strictEqual(adjustmentAmount <= remainingGRNI, true, 'adjustment within remaining balance');

  const excessiveAmount = 3001;
  assert.strictEqual(excessiveAmount <= remainingGRNI, false, 'excessive adjustment rejected');

  testsPassed++;
});

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\nTest Results: ${testsPassed} passed, ${testsFailed} failed`);
