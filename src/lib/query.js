function getPath(source, path) {
  return path.split('.').reduce((value, part) => {
    if (Array.isArray(value)) return value.map((item) => item?.[part]);
    return value?.[part];
  }, source);
}

function asText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(asText).join(' ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function parseListQuery(request) {
  const { searchParams } = new URL(request.url);
  const pageRaw = searchParams.get('page');
  const page = pageRaw ? Math.max(1, Number(pageRaw) || 1) : null;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50));
  return {
    search: (searchParams.get('search') || searchParams.get('q') || '').trim(),
    status: (searchParams.get('status') || '').trim(),
    category: (searchParams.get('category') || '').trim(),
    sort: searchParams.get('sort') || '',
    order: searchParams.get('order') === 'asc' ? 1 : -1,
    page,
    limit,
  };
}

export function applyListQuery(records, query, {
  searchFields = [],
  statusField = 'status',
  categoryField = 'category',
} = {}) {
  let items = Array.isArray(records) ? [...records] : [];

  if (query.status && statusField) {
    items = items.filter((item) => String(item?.[statusField] ?? '') === query.status);
  }
  if (query.category && categoryField) {
    items = items.filter((item) => String(item?.[categoryField] ?? '') === query.category);
  }
  if (query.search && searchFields.length) {
    const needle = query.search.toLowerCase();
    items = items.filter((item) =>
      searchFields.some((field) => asText(getPath(item, field)).toLowerCase().includes(needle))
    );
  }
  if (query.sort) {
    const field = query.sort;
    const direction = query.order;
    items.sort((left, right) => {
      const a = getPath(left, field);
      const b = getPath(right, field);
      if (a === b) return 0;
      if (a == null) return -1 * direction;
      if (b == null) return 1 * direction;
      return (a > b ? 1 : -1) * direction;
    });
  }

  const total = items.length;
  if (query.page) {
    const start = (query.page - 1) * query.limit;
    items = items.slice(start, start + query.limit);
  }

  return {
    items,
    pagination: {
      total,
      page: query.page,
      limit: query.limit,
      pages: query.page ? Math.max(1, Math.ceil(total / query.limit)) : 1,
    },
  };
}

export async function updateRecord(Model, id, fields) {
  const record = await Model.findByIdForUpdate(id);
  if (!record) return null;
  Object.assign(record, fields);
  return record.save();
}

export async function deleteRecord(Model, id) {
  const record = await Model.findByIdForUpdate(id);
  if (!record) return null;
  await Model.deleteOne({ _id: record._id });
  return record;
}

export function pickFields(body, allowed) {
  const result = {};
  for (const field of allowed) {
    if (body[field] !== undefined) result[field] = body[field];
  }
  return result;
}
