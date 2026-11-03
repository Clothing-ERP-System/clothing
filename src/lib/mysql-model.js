import { randomUUID } from 'node:crypto';
import { pool } from '@/lib/db.js';

const initializedTables = new Set();
const registeredModels = [];
const safeName = /^[A-Za-z][A-Za-z0-9_]*$/;

function tableFor(name) {
  if (!safeName.test(name)) throw new Error(`Invalid MySQL model name: ${name}`);
  const tableName = name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
  return `erp_${tableName}`;
}

function parsePayload(payload) {
  if (payload == null) return {};
  if (typeof payload === 'string') {
    return JSON.parse(payload);
  }
  return payload;
}

function serializePayload(document) {
  return JSON.stringify(document, (_key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

function mysqlError(error) {
  if (error?.code === 'ER_DUP_ENTRY') {
    const duplicate = new Error('A record with this unique value already exists');
    duplicate.status = 409;
    return duplicate;
  }
  return error;
}

function uniqueColumnSql(table, field) {
  if (!safeName.test(field)) throw new Error(`Invalid unique field: ${field}`);
  const index = `uq_${table}_${field}`.slice(0, 60);
  return {
    field,
    index,
    definition: `\`${field}\` VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.${field}'))) STORED`,
  };
}

async function ensureUniqueColumns(table, uniqueFields) {
  for (const field of uniqueFields) {
    const { index, definition } = uniqueColumnSql(table, field);
    const [columns] = await pool.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, field]
    );
    if (!columns.length) {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
    }
    const [indexes] = await pool.query(
      `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [table, index]
    );
    if (!indexes.length) {
      await pool.query(`ALTER TABLE \`${table}\` ADD UNIQUE KEY \`${index}\` (\`${field}\`)`);
    }
  }
}

async function ensureTable(table, uniqueFields) {
  if (initializedTables.has(table)) return;
  const generatedColumns = uniqueFields
    .map((field) => {
      const { index, definition } = uniqueColumnSql(table, field);
      return `${definition}, UNIQUE KEY \`${index}\` (\`${field}\`)`;
    })
    .join(', ');
  const createdIndex = `idx_${table}_created_at`.slice(0, 60);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`${table}\` (
      id CHAR(36) NOT NULL PRIMARY KEY,
      payload JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX \`${createdIndex}\` (created_at)
      ${generatedColumns ? `, ${generatedColumns}` : ''}
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureUniqueColumns(table, uniqueFields);
  initializedTables.add(table);
}

function pathValues(source, path) {
  const parts = path.split('.').filter(Boolean);
  let current = [source];
  for (const part of parts) {
    const next = [];
    for (const item of current) {
      if (item == null) continue;
      if (Array.isArray(item)) {
        for (const element of item) {
          if (element != null && typeof element === 'object') next.push(element[part]);
        }
      } else if (typeof item === 'object') {
        next.push(item[part]);
      }
    }
    current = next;
  }
  return current;
}

function pathValue(source, path) {
  const values = pathValues(source, path);
  return values.length <= 1 ? values[0] : values;
}

function asNumber(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return NaN;
}

function valuesEqual(actual, expected) {
  if (actual === expected) return true;
  if (Array.isArray(actual)) return actual.some((value) => valuesEqual(value, expected));
  if (actual == null || expected == null) return actual == expected;
  const actualNumber = asNumber(actual);
  const expectedNumber = asNumber(expected);
  if (!Number.isNaN(actualNumber) && !Number.isNaN(expectedNumber)) return actualNumber === expectedNumber;
  return String(actual) === String(expected);
}

function compare(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    return Object.entries(expected).every(([operator, value]) => {
      const actualNumber = asNumber(actual);
      const expectedNumber = asNumber(value);
      const numeric = !Number.isNaN(actualNumber) && !Number.isNaN(expectedNumber);
      switch (operator) {
        case '$eq': return valuesEqual(actual, value);
        case '$ne': return !valuesEqual(actual, value);
        case '$in': return Array.isArray(value) && value.some((item) => valuesEqual(actual, item));
        case '$nin': return Array.isArray(value) && !value.some((item) => valuesEqual(actual, item));
        case '$gt': return numeric ? actualNumber > expectedNumber : actual > value;
        case '$gte': return numeric ? actualNumber >= expectedNumber : actual >= value;
        case '$lt': return numeric ? actualNumber < expectedNumber : actual < value;
        case '$lte': return numeric ? actualNumber <= expectedNumber : actual <= value;
        default: return false;
      }
    });
  }
  return valuesEqual(actual, expected);
}

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((part) => matches(document, part));
    if (key === '$and') return expected.every((part) => matches(document, part));
    if (key === '$expr') {
      const [[operator, operands]] = Object.entries(expected);
      const [left, right] = operands.map((operand) =>
        typeof operand === 'string' && operand.startsWith('$')
          ? pathValue(document, operand.slice(1))
          : operand
      );
      return compare(left, { [operator]: right });
    }
    const values = pathValues(document, key);
    if (!values.length) return compare(undefined, expected);
    return values.some((actual) => compare(actual, expected));
  });
}

function applyProjection(document, projection) {
  if (typeof projection !== 'string' || !projection.startsWith('-')) return document;
  const copy = { ...document };
  for (const field of projection.split(/\s+/).filter(Boolean)) {
    if (field.startsWith('-')) delete copy[field.slice(1)];
  }
  return copy;
}

function decorate(record, model) {
  if (!record) return null;
  const document = { ...record };
  Object.defineProperties(document, {
    toObject: { enumerable: false, value: () => ({ ...document }) },
    save: {
      enumerable: false,
      value: async () => {
        const now = new Date();
        document.updatedAt = now;
        await ensureTable(model.table, model.uniqueFields);
        try {
          const [result] = await pool.execute(
            `UPDATE \`${model.table}\` SET payload = ?, updated_at = ? WHERE id = ?`,
            [serializePayload(document), now, document._id]
          );
          if (result.affectedRows !== 1) {
            const missing = new Error('Record no longer exists');
            missing.status = 404;
            throw missing;
          }
        } catch (error) {
          throw mysqlError(error);
        }
        return document;
      },
    },
  });
  return document;
}

async function readRecords(model) {
  await ensureTable(model.table, model.uniqueFields);
  const [rows] = await pool.query(`SELECT payload FROM \`${model.table}\``);
  return rows.map(({ payload }) => parsePayload(payload));
}

class ModelQuery {
  constructor(model, operation, args) {
    this.model = model;
    this.operation = operation;
    this.args = args;
    this.sortSpec = null;
    this.maxResults = null;
    this.skipCount = 0;
  }

  sort(specification) { this.sortSpec = specification; return this; }
  limit(count) { this.maxResults = count; return this; }
  skip(count) { this.skipCount = Number(count) || 0; return this; }
  populate() { return this; }

  async execute() {
    const records = await readRecords(this.model);
    if (this.operation === 'count') {
      return records.filter((record) => matches(record, this.args[0])).length;
    }
    const [filter = {}, projection] = this.args;
    let found = records.filter((record) => matches(record, filter));
    if (this.sortSpec) {
      found.sort((left, right) => {
        for (const [field, direction] of Object.entries(this.sortSpec)) {
          const a = pathValue(left, field);
          const b = pathValue(right, field);
          if (valuesEqual(a, b)) continue;
          const aNumber = asNumber(a);
          const bNumber = asNumber(b);
          let comparison;
          if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber)) comparison = aNumber > bNumber ? 1 : -1;
          else comparison = a == null ? -1 : b == null ? 1 : a > b ? 1 : -1;
          if (comparison) return comparison * direction;
        }
        return 0;
      });
    }
    if (this.skipCount) found = found.slice(this.skipCount);
    if (this.maxResults !== null) found = found.slice(0, this.maxResults);
    found = found.map((record) => decorate(applyProjection(record, projection), this.model));
    return this.operation === 'findOne' ? found[0] || null : found;
  }

  then(resolve, reject) { return this.execute().then(resolve, reject); }
  catch(reject) { return this.execute().catch(reject); }
}

function applyUpdate(record, update) {
  const entries = Object.entries(update || {});
  if (!entries.some(([key]) => key.startsWith('$'))) return { ...record, ...update };
  const result = { ...record };
  for (const [operator, values] of entries) {
    if (operator === '$set') Object.assign(result, values);
    if (operator === '$unset') {
      for (const key of Object.keys(values || {})) delete result[key];
    }
    if (operator === '$inc') {
      for (const [key, amount] of Object.entries(values || {})) {
        result[key] = (Number(result[key]) || 0) + Number(amount);
      }
    }
    if (operator === '$push') {
      for (const [key, value] of Object.entries(values || {})) {
        result[key] = Array.isArray(result[key]) ? [...result[key], value] : [value];
      }
    }
  }
  return result;
}

export async function ensureRegisteredTables() {
  for (const model of registeredModels) {
    await ensureTable(model.table, model.uniqueFields);
  }
}

export function createMySQLModel(name, uniqueFields = []) {
  const model = { table: tableFor(name), uniqueFields };
  registeredModels.push(model);
  model.find = (filter = {}, projection) => new ModelQuery(model, 'find', [filter, projection]);
  model.findOne = (filter = {}, projection) => new ModelQuery(model, 'findOne', [filter, projection]);
  model.findById = (id) => new ModelQuery(model, 'findOne', [{ _id: String(id) }]);
  model.findByIdForUpdate = async (id) => {
    await ensureTable(model.table, model.uniqueFields);
    const [rows] = await pool.query(`SELECT payload FROM \`${model.table}\` WHERE id = ? FOR UPDATE`, [String(id)]);
    return rows[0] ? decorate(parsePayload(rows[0].payload), model) : null;
  };
  model.countDocuments = (filter = {}) => new ModelQuery(model, 'count', [filter]);

  model.create = async (input) => {
    if (Array.isArray(input)) return Promise.all(input.map((item) => model.create(item)));
    await ensureTable(model.table, model.uniqueFields);
    const now = new Date();
    const record = { ...input, _id: input._id || randomUUID(), createdAt: input.createdAt || now, updatedAt: now };
    try {
      await pool.execute(
        `INSERT INTO \`${model.table}\` (id, payload, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        [record._id, serializePayload(record), record.createdAt, now]
      );
    } catch (error) {
      throw mysqlError(error);
    }
    return decorate(record, model);
  };

  model.findOneAndUpdate = async (filter, update, options = {}) => {
    const record = await model.findOne(filter);
    if (!record) {
      if (!options.upsert) return null;
      const created = await model.create(applyUpdate({}, update));
      return options.new === true || options.returnDocument === 'after' ? created : null;
    }
    const previous = record.toObject();
    const updated = applyUpdate(record, update);
    Object.assign(record, updated);
    const saved = await record.save();
    return options.new === true || options.returnDocument === 'after'
      ? saved
      : decorate(previous, model);
  };

  model.findByIdAndUpdate = async (id, update, options = {}) =>
    model.findOneAndUpdate({ _id: String(id) }, update, options);

  model.deleteOne = async (filter = {}) => {
    const record = filter._id
      ? await model.findByIdForUpdate(String(filter._id))
      : await model.findOne(filter);
    if (!record) return { deletedCount: 0 };
    if (!matches(record, filter)) return { deletedCount: 0 };
    await pool.execute(`DELETE FROM \`${model.table}\` WHERE id = ?`, [record._id]);
    return { deletedCount: 1 };
  };

  model.findByIdAndDelete = async (id) => {
    const record = await model.findByIdForUpdate(id);
    if (!record) return null;
    await model.deleteOne({ _id: record._id });
    return record;
  };

  model.deleteMany = async (filter = {}) => {
    const records = (await readRecords(model)).filter((record) => matches(record, filter));
    if (records.length) {
      const ids = records.map((record) => record._id);
      const placeholders = ids.map(() => '?').join(', ');
      await pool.query(`DELETE FROM \`${model.table}\` WHERE id IN (${placeholders})`, ids);
    }
    return { deletedCount: records.length };
  };

  return model;
}
