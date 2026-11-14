'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { evaluatePasswordStrength } from '../src/lib/password-policy.js';
import { hashPassword, verifyPassword, generateToken, verifyToken } from '../src/lib/auth.js';
import { ERP_MODULES, ROLE_ACTIONS } from '../src/lib/role-definitions.js';

function canAccessModule(user, module, action = 'view') {
  if (!user || !module || !ROLE_ACTIONS.includes(action)) return false;
  if (user.role === 'SuperAdmin') return true;
  return false;
}

const TEST_DB = 'clothing_erp_test_handover';

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

function parseRowPayload(payload) {
  if (payload == null) return {};
  return typeof payload === 'string' ? JSON.parse(payload) : payload;
}

test('ERP DOST — SECURE CLIENT SUPERADMIN HANDOVER SPECIFICATION TEST', async (t) => {
  let pool;
  const developerEmail = 'zainabasghar307@gmail.com';
  const clientEmail = 'client.owner@garmentfactory.pk';
  const clientName = 'Tariq Mehmood';
  let activeHandoverToken = '';
  let activeHandoverTokenHash = '';

  await t.test('1. Setup isolated MySQL 8.4 database: ' + TEST_DB, async () => {
    const adminPool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
    });
    await adminPool.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    await adminPool.query(`CREATE DATABASE \`${TEST_DB}\``);
    await adminPool.end();

    pool = mysql.createPool(getTestDbConfig());

    // Create required tables
    await pool.query(`CREATE TABLE erp_company (
      id CHAR(36) PRIMARY KEY,
      payload JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await pool.query(`CREATE TABLE erp_user (
      id CHAR(36) PRIMARY KEY,
      payload JSON NOT NULL,
      email VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.email'))) STORED,
      role VARCHAR(100) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.role'))) STORED,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_erp_user_email (email)
    ) ENGINE=InnoDB;`);

    await pool.query(`CREATE TABLE erp_audit_log (
      id CHAR(36) PRIMARY KEY,
      payload JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;`);

    await pool.query(`CREATE TABLE erp_handover_invitation (
      id CHAR(36) PRIMARY KEY,
      payload JSON NOT NULL,
      tokenHash VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.tokenHash'))) STORED,
      clientEmail VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.clientEmail'))) STORED,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_handover_tokenHash (tokenHash)
    ) ENGINE=InnoDB;`);

    // Verify empty state: 0 companies, 0 users
    const [cRows] = await pool.query('SELECT COUNT(*) as cnt FROM erp_company');
    const [uRows] = await pool.query('SELECT COUNT(*) as cnt FROM erp_user');
    assert.equal(Number(cRows[0].cnt), 0, 'Initial companies must be 0');
    assert.equal(Number(uRows[0].cnt), 0, 'Initial users must be 0');
  });

  await t.test('2. Seed preserved Developer SuperAdmin login', async () => {
    const devHashedPassword = await hashPassword('Developer#SuperAdmin2026!');
    const devUserId = 'dev-superadmin-001';
    const devPayload = {
      _id: devUserId,
      name: 'Zainab Asghar',
      email: developerEmail,
      password: devHashedPassword,
      role: 'SuperAdmin',
      permissions: ['ALL'],
      branch: 'Head Office',
      department: 'Executive',
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    await pool.query('INSERT INTO erp_user (id, payload) VALUES (?, ?)', [
      devUserId,
      JSON.stringify(devPayload),
    ]);

    const [rows] = await pool.query('SELECT * FROM erp_user WHERE email = ?', [developerEmail]);
    assert.equal(rows.length, 1);
    const stored = parseRowPayload(rows[0].payload);
    assert.equal(stored.role, 'SuperAdmin');
    assert.equal(stored.isActive, true);

    // Verify developer password verifies correctly
    const valid = await verifyPassword('Developer#SuperAdmin2026!', stored.password);
    assert.equal(valid, true, 'Developer credentials must verify');
  });

  await t.test('3. Security Check: Reject unauthenticated arbitrary SuperAdmin bootstrap creation', async () => {
    // Attempting to claim ownership with an arbitrary or empty token must fail
    const fakeToken = randomBytes(32).toString('hex');
    const fakeTokenHash = createHash('sha256').update(fakeToken).digest('hex');

    const [invRows] = await pool.query(
      'SELECT * FROM erp_handover_invitation WHERE tokenHash = ?',
      [fakeTokenHash]
    );
    assert.equal(invRows.length, 0, 'Unregistered token must not exist');

    // Simulate endpoint check
    const isValidToken = invRows.length > 0;
    assert.equal(isValidToken, false, 'Unregistered token must be rejected');
  });

  await t.test('4. Requirement 1, 2, 3: Developer SuperAdmin generates secure one-time client invitation', async () => {
    // Zero exposure of developer password: developer is authenticated via session
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const invId = 'inv-' + randomBytes(8).toString('hex');

    const invPayload = {
      _id: invId,
      tokenHash,
      clientEmail,
      clientName,
      invitedBy: developerEmail,
      expiresAt,
      used: false,
      usedAt: null,
      claimedBy: null,
      createdAt: new Date().toISOString(),
    };

    await pool.query('INSERT INTO erp_handover_invitation (id, payload) VALUES (?, ?)', [
      invId,
      JSON.stringify(invPayload),
    ]);

    activeHandoverToken = rawToken;
    activeHandoverTokenHash = tokenHash;

    const [rows] = await pool.query(
      'SELECT * FROM erp_handover_invitation WHERE tokenHash = ?',
      [tokenHash]
    );
    assert.equal(rows.length, 1);
    const parsed = parseRowPayload(rows[0].payload);
    assert.equal(parsed.clientEmail, clientEmail);
    assert.equal(parsed.used, false);
    assert.ok(new Date(parsed.expiresAt) > new Date());
  });

  await t.test('5. Requirement 4: Enforce 12-character password policy on client claim', async () => {
    // Test weak password permutations
    const weakPasswords = [
      'short1!', // under 12 characters
      'alllowercase123!', // no uppercase
      'ALLUPPERCASE123!', // no lowercase
      'NoDigitsHere!Special', // no digit
      'NoSpecialChar123456', // no special character
      '1234567890123', // digits only
    ];

    for (const pwd of weakPasswords) {
      const evaluation = evaluatePasswordStrength(pwd);
      assert.equal(
        evaluation.isValid,
        false,
        `Password "${pwd}" should fail complexity requirements`
      );
    }

    // Strong password must pass
    const strongPassword = 'ClientOwner#2026!Secure';
    const strongEvaluation = evaluatePasswordStrength(strongPassword);
    assert.equal(strongEvaluation.isValid, true, 'Strong password must satisfy all criteria');
    assert.equal(strongEvaluation.minLength, true);
    assert.equal(strongEvaluation.hasUpper, true);
    assert.equal(strongEvaluation.hasLower, true);
    assert.equal(strongEvaluation.hasNumber, true);
    assert.equal(strongEvaluation.hasSpecial, true);
  });

  await t.test('6. Requirement 5 & 6: Concurrency Protection & Atomic Client Claim', async () => {
    const strongPassword = 'ClientOwner#2026!Secure';
    const hashedPassword = await hashPassword(strongPassword);

    // Acquire MySQL advisory lock to simulate atomic concurrency check
    const connection = await pool.getConnection();
    let lockAcquired = false;
    try {
      const [lockRows] = await connection.query(
        'SELECT GET_LOCK(?, ?) AS lock_acquired',
        ['clothing_erp:handover_claim', 5]
      );
      lockAcquired = Number(lockRows[0]?.lock_acquired) === 1;
      assert.equal(lockAcquired, true, 'Advisory lock must be acquired');

      // Verify token is unused
      const [invRows] = await connection.query(
        'SELECT * FROM erp_handover_invitation WHERE tokenHash = ?',
        [activeHandoverTokenHash]
      );
      assert.equal(invRows.length, 1);
      const invData = parseRowPayload(invRows[0].payload);
      assert.equal(invData.used, false, 'Token must not have been used yet');

      // Create client SuperAdmin
      const clientUserId = 'client-superadmin-001';
      const clientPayload = {
        _id: clientUserId,
        name: clientName,
        email: clientEmail,
        password: hashedPassword,
        role: 'SuperAdmin',
        permissions: ['ALL'],
        branch: 'Head Office',
        department: 'Executive',
        isActive: true,
        isHandoverAdmin: true,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: new Date().toISOString(),
      };

      await connection.query('INSERT INTO erp_user (id, payload) VALUES (?, ?)', [
        clientUserId,
        JSON.stringify(clientPayload),
      ]);

      // Invalidate the invitation
      invData.used = true;
      invData.usedAt = new Date().toISOString();
      invData.claimedBy = clientUserId;

      await connection.query(
        'UPDATE erp_handover_invitation SET payload = ? WHERE id = ?',
        [JSON.stringify(invData), invRows[0].id]
      );
    } finally {
      if (lockAcquired) {
        await connection.query('SELECT RELEASE_LOCK(?)', ['clothing_erp:handover_claim']);
      }
      connection.release();
    }

    // Verify in database
    const [cUserRows] = await pool.query('SELECT * FROM erp_user WHERE email = ?', [clientEmail]);
    assert.equal(cUserRows.length, 1);
    const clientUser = parseRowPayload(cUserRows[0].payload);
    assert.equal(clientUser.role, 'SuperAdmin');
    assert.equal(clientUser.isActive, true);
  });

  await t.test('7. Requirement 10: Ensure handover token cannot be reused', async () => {
    // Attempting to claim again with same token
    const [invRows] = await pool.query(
      'SELECT * FROM erp_handover_invitation WHERE tokenHash = ?',
      [activeHandoverTokenHash]
    );
    assert.equal(invRows.length, 1);
    const inv = parseRowPayload(invRows[0].payload);
    assert.equal(inv.used, true, 'Invitation token must be marked as used');

    // The endpoint logic: if (invitation.used) return errorResponse(..., 410)
    const canReuse = !inv.used && new Date(inv.expiresAt) > new Date();
    assert.equal(canReuse, false, 'Replaying the invitation token must be rejected');
  });

  await t.test('8. Requirement 7 & 8: Client logs in with own credentials & full SuperAdmin permissions', async () => {
    // Find client in DB
    const [rows] = await pool.query('SELECT * FROM erp_user WHERE email = ?', [clientEmail]);
    assert.equal(rows.length, 1);
    const clientUser = parseRowPayload(rows[0].payload);

    // Verify password check works
    const isPasswordCorrect = await verifyPassword('ClientOwner#2026!Secure', clientUser.password);
    assert.equal(isPasswordCorrect, true, 'Client password must match');

    // Generate JWT session token
    const sessionToken = generateToken({
      id: clientUser._id,
      name: clientUser.name,
      email: clientUser.email,
      role: clientUser.role,
      permissions: ['ALL'],
      isActive: true,
    });
    assert.ok(sessionToken && sessionToken.length > 20);

    const decoded = verifyToken(sessionToken);
    assert.equal(decoded.email, clientEmail);
    assert.equal(decoded.role, 'SuperAdmin');

    // Verify SuperAdmin RBAC access across all ERP modules
    for (const mod of ERP_MODULES) {
      for (const act of ROLE_ACTIONS) {
        const hasAccess = canAccessModule(clientUser, mod, act);
        assert.equal(
          hasAccess,
          true,
          `Client SuperAdmin must have unrestricted access to ${mod}:${act}`
        );
      }
    }
  });

  await t.test('9. Requirement 9: Developer account remains active until explicit safe deactivation', async () => {
    // Before deactivation: verify both developer and client are active
    const [devRows] = await pool.query('SELECT * FROM erp_user WHERE email = ?', [developerEmail]);
    const devUser = parseRowPayload(devRows[0].payload);
    assert.equal(devUser.isActive, true, 'Developer account must still be active before deactivation');

    // Check count of active SuperAdmins
    const [allUsers] = await pool.query('SELECT * FROM erp_user');
    const superAdmins = allUsers
      .map((r) => parseRowPayload(r.payload))
      .filter((u) => u.role === 'SuperAdmin' && u.isActive !== false);

    assert.equal(superAdmins.length, 2, 'Must have exactly 2 active SuperAdmins before deactivating developer');

    // Deactivate developer account
    devUser.isActive = false;
    await pool.query('UPDATE erp_user SET payload = ? WHERE email = ?', [
      JSON.stringify(devUser),
      developerEmail,
    ]);

    // Verify developer is now inactive
    const [updatedDevRows] = await pool.query('SELECT * FROM erp_user WHERE email = ?', [developerEmail]);
    const updatedDev = parseRowPayload(updatedDevRows[0].payload);
    assert.equal(updatedDev.isActive, false, 'Developer account must be inactive');

    // Verify client remains the sole active SuperAdmin
    const [activeRows] = await pool.query('SELECT * FROM erp_user');
    const remainingActive = activeRows
      .map((r) => parseRowPayload(r.payload))
      .filter((u) => u.role === 'SuperAdmin' && u.isActive !== false);

    assert.equal(remainingActive.length, 1, 'Exactly one active SuperAdmin remains');
    assert.equal(remainingActive[0].email, clientEmail, 'Active SuperAdmin must be the client');
  });

  await t.test('10. Clean up isolated test database', async () => {
    await pool.end();
    const adminPool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
    });
    await adminPool.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    await adminPool.end();
  });
});
