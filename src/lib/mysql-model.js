import { randomUUID } from 'node:crypto';
import { pool } from '@/lib/db.js';

const initializedTables = new Set();
const safeName = /^[A-Za-z][A-Za-z0-9_]*$/;

function tableFor(name) {
  if (!safeName.test(name)) throw new Error(`Invalid MySQL model name: ${name}`);
  return `erp_${name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/^_/, '')}`;
}

async function ensureTable(table, uniqueFields) {
  if (initializedTables.has(table)) return;
  const generatedColumns = uniqueFields
    .map((field) => {
      if (!safeName.test(field)) throw new Error(`Invalid unique field: ${field}`);
      const index = `uq_${table}_${field}`.slice(0, 60);
      return `\`${field}\` VARCHAR(255) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.${field}'))) STORED, UNIQUE KEY \`${index}\` (\`${field}\`)`;
    })
    .join(', ');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`${table}\` (
      id CHAR(36) NOT NULL PRIMARY KEY,
      payload JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      INDEX idx_${table}_created_at (created_at)
      ${generatedColumns ? `, ${generatedColumns}` : ''}
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  initializedTables.add(table);
}

function pathValue(source, path) {
  return path.split('.').reduce((value, part) => value?.[part], source);
}

function compare(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    return Object.entries(expected).every(([operator, value]) => {
      switch (operator) {
        case '$eq': return actual === value;
        case '$ne': return actual !== value;
        case '$in': return value.includes(actual);
        case '$nin': return !value.includes(actual);
        case '$gt': return actual > value;
        case '$gte': return actual >= value;
        case '$lt': return actual < value;
        case '$lte': return actual <= value;
        default: return false;
      }
    });
  }
  return String(actual ?? '') === String(expected ?? '');
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
    return compare(pathValue(document, key), expected);
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
        await pool.execute(
          `UPDATE \`${model.table}\` SET payload = ?, updated_at = ? WHERE id = ?`,
          [JSON.stringify(document), now, document._id]
        );
        return document;
      },
    },
  });
  return document;
}

async function readRecords(model) {
  await ensureTable(model.table, model.uniqueFields);
  const [rows] = await pool.query(`SELECT payload FROM \`${model.table}\``);
  return rows.map(({ payload }) => (typeof payload === 'string' ? JSON.parse(payload) : payload));
}

class ModelQuery {
  constructor(model, operation, args) {
    this.model = model;
    this.operation = operation;
    this.args = args;
    this.sortSpec = null;
    this.maxResults = null;
  }

  sort(specification) { this.sortSpec = specification; return this; }
  limit(count) { this.maxResults = count; return this; }
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
          if (a === b) continue;
          const comparison = a == null ? -1 : b == null ? 1 : a > b ? 1 : -1;
          if (comparison) return comparison * direction;
        }
        return 0;
      });
    }
    if (this.maxResults !== null) found = found.slice(0, this.maxResults);
    found = found.map((record) => decorate(applyProjection(record, projection), this.model));
    return this.operation === 'findOne' ? found[0] || null : found;
  }

  then(resolve, reject) { return this.execute().then(resolve, reject); }
  catch(reject) { return this.execute().catch(reject); }
}

function applyUpdate(record, update) {
  const entries = Object.entries(update);
  if (!entries.some(([key]) => key.startsWith('$'))) return { ...record, ...update };
  const result = { ...record };
  for (const [operator, values] of entries) {
    if (operator === '$set') Object.assign(result, values);
    if (operator === '$inc') {
      for (const [key, amount] of Object.entries(values)) {
        result[key] = (Number(result[key]) || 0) + Number(amount);
      }
    }
  }
  return result;
}

export function createMySQLModel(name, uniqueFields = []) {
  const model = { table: tableFor(name), uniqueFields };
  model.find = (filter = {}, projection) => new ModelQuery(model, 'find', [filter, projection]);
  model.findOne = (filter = {}, projection) => new ModelQuery(model, 'findOne', [filter, projection]);
  model.findById = (id) => new ModelQuery(model, 'findOne', [{ _id: String(id) }]);
  model.countDocuments = (filter = {}) => new ModelQuery(model, 'count', [filter]);

  model.create = async (input) => {
    if (Array.isArray(input)) return Promise.all(input.map((item) => model.create(item)));
    await ensureTable(model.table, model.uniqueFields);
    const now = new Date();
    const record = { ...input, _id: input._id || randomUUID(), createdAt: input.createdAt || now, updatedAt: now };
    await pool.execute(
      `INSERT INTO \`${model.table}\` (id, payload, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      [record._id, JSON.stringify(record), record.createdAt, now]
    );
    return decorate(record, model);
  };

  model.findOneAndUpdate = async (filter, update, options = {}) => {
    const record = await model.findOne(filter);
    if (!record) return options.upsert ? model.create(applyUpdate({}, update)) : null;
    const updated = applyUpdate(record, update);
    Object.assign(record, updated);
    return options.new === false ? record : record.save();
  };

  model.deleteMany = async (filter = {}) => {
    const records = (await readRecords(model)).filter((record) => matches(record, filter));
    if (records.length) {
      await pool.query(`DELETE FROM \`${model.table}\` WHERE id IN (?)`, [
        records.map((record) => record._id),
      ]);
    }
    return { deletedCount: records.length };
  };

  return model;
}
