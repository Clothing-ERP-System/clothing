import mysql from 'mysql2/promise';
import { AsyncLocalStorage } from 'node:async_hooks';

const globalForMySQL = globalThis;
const transactionStorage = new AsyncLocalStorage();

function requiredEnv(name) {
  const value = process.env[name];
  if (value == null || String(value).trim() === '') {
    throw new Error(`${name} is not configured. Set it in .env.local.`);
  }
  return value;
}

function createPool() {
  const password = process.env.MYSQL_PASSWORD;
  if (password == null) {
    throw new Error('MYSQL_PASSWORD is not configured. Set it in .env.local.');
  }
  return mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: requiredEnv('MYSQL_USER'),
    password,
    database: requiredEnv('MYSQL_DATABASE'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
  });
}

function getPool() {
  if (!globalForMySQL.mysqlPool) {
    globalForMySQL.mysqlPool = createPool();
  }
  return globalForMySQL.mysqlPool;
}

export const pool = {
  getConnection: (...args) => getPool().getConnection(...args),
  query: (...args) => (transactionStorage.getStore() || getPool()).query(...args),
  execute: (...args) => (transactionStorage.getStore() || getPool()).execute(...args),
};

export async function runInTransaction(callback) {
  if (transactionStorage.getStore()) return callback();

  const connection = await getPool().getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await transactionStorage.run(connection, callback);
    if (result && typeof result.status === 'number' && result.status >= 400) {
      transactionStarted = false;
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('MySQL transaction rollback failed:', rollbackError);
        throw rollbackError;
      }
      return result;
    }
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('MySQL transaction rollback failed:', rollbackError);
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function connectDB() {
  const connection = await pool.getConnection();
  connection.release();
  if (!globalForMySQL.erpSchemaReady) {
    if (!globalForMySQL.erpSchemaPromise) {
      globalForMySQL.erpSchemaPromise = (async () => {
        const { initializeErpSchema } = await import('@/lib/schema.js');
        await initializeErpSchema();
        globalForMySQL.erpSchemaReady = true;
      })();
    }
    try {
      await globalForMySQL.erpSchemaPromise;
    } catch (error) {
      globalForMySQL.erpSchemaPromise = null;
      throw error;
    }
  }
  return getPool();
}

export async function allocateSequence(name) {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS erp_sequences (
        sequence_name VARCHAR(80) NOT NULL PRIMARY KEY,
        sequence_value BIGINT UNSIGNED NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await connection.execute(
      `INSERT INTO erp_sequences (sequence_name, sequence_value)
       VALUES (?, LAST_INSERT_ID(1))
       ON DUPLICATE KEY UPDATE sequence_value = LAST_INSERT_ID(sequence_value + 1)`,
      [name]
    );
    const [rows] = await connection.query('SELECT LAST_INSERT_ID() AS sequenceValue');
    return Number(rows[0].sequenceValue);
  } finally {
    connection.release();
  }
}
