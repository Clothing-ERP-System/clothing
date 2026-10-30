import mysql from 'mysql2/promise';

const globalForMySQL = globalThis;
const pool =
  globalForMySQL.mysqlPool ||
  mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'clothing_erp',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
  });

if (process.env.NODE_ENV !== 'production') globalForMySQL.mysqlPool = pool;

export async function connectDB() {
  const connection = await pool.getConnection();
  connection.release();
  return pool;
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

export { pool };
