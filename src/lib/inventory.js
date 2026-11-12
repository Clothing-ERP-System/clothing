import { randomUUID } from 'node:crypto';

export function recordInventoryMovement(record, {
  type,
  quantity,
  unit,
  direction = 'IN',
  referenceType,
  referenceId,
  referenceNumber,
  sourceItemId,
  warehouseLocation,
  notes = '',
}) {
  if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
    throw new Error('Inventory movement quantity must be greater than zero');
  }

  const movement = {
    movementId: randomUUID(),
    type,
    quantity: Number(quantity),
    unit: unit || '',
    direction,
    referenceType: referenceType || '',
    referenceId: referenceId || '',
    referenceNumber: referenceNumber || '',
    sourceItemId: sourceItemId || '',
    warehouseLocation: warehouseLocation || '',
    occurredAt: new Date(),
    notes,
  };
  record.movements = [...(Array.isArray(record.movements) ? record.movements : []), movement];
  return movement;
}

export function sumAvailableFabricMeters(fabric) {
  let total = 0;
  for (const roll of Array.isArray(fabric.rolls) ? fabric.rolls : []) {
    if (['Voided', 'InTransit'].includes(roll.status)) continue;
    const remaining = Number(roll.remainingMeters);
    if (!Number.isFinite(remaining) || remaining < 0) {
      throw inventoryError(`Fabric roll ${roll.rollNumber || ''} has an invalid remaining quantity`, 409);
    }
    total += remaining;
  }
  if (!Number.isFinite(total)) throw inventoryError('Fabric stock total is outside the supported range', 409);
  return total;
}

export function adjustWarehouseStock(record, quantityField, warehouse, quantity, allowUnassigned = false, locationId = '') {
  const location = String(warehouse || '').trim();
  const amount = Number(quantity);
  const total = Number(record[quantityField]);
  if (!location || !Number.isFinite(amount) || amount === 0 || !Number.isFinite(total) || total < 0) {
    return false;
  }

  const balances = Array.isArray(record.warehouseBalances) ? [...record.warehouseBalances] : [];
  if (!balances.length && total > 0) {
    if (!allowUnassigned) return false;
    balances.push({ warehouse: location, quantity: total, locationId: locationId || '' });
  }
  const balanceTotal = balances.reduce((sum, entry) => sum + Number(entry.quantity), 0);
  if (!Number.isFinite(balanceTotal) || Math.abs(balanceTotal - total) > 0.000001) return false;

  // Match by warehouse AND locationId for bin-level identity.
  // When locationId is empty, match by warehouse only (unlocated stock).
  const index = balances.findIndex((entry) =>
    entry.warehouse === location &&
    (locationId ? entry.locationId === locationId : !entry.locationId)
  );
  const current = index < 0 ? 0 : Number(balances[index].quantity);
  const nextBalance = current + amount;
  const nextTotal = total + amount;
  if (!Number.isFinite(current) || current < 0 ||
    !Number.isFinite(nextBalance) || nextBalance < -0.000001 ||
    !Number.isFinite(nextTotal) || nextTotal < -0.000001) {
    return false;
  }
  const balanceEntry = { warehouse: location, quantity: Math.max(0, nextBalance) };
  if (locationId) balanceEntry.locationId = locationId;
  else balanceEntry.locationId = '';
  if (index < 0) balances.push(balanceEntry);
  else balances[index] = balanceEntry;
  record.warehouseBalances = balances;
  record[quantityField] = Math.max(0, nextTotal);
  return true;
}

export function getWarehouseStock(record, quantityField, warehouse, locationId = '') {
  const location = String(warehouse || '').trim();
  const total = Number(record[quantityField]);
  const balances = Array.isArray(record.warehouseBalances) ? record.warehouseBalances : [];
  if (!location || !Number.isFinite(total) || total < 0 || !balances.length) return null;
  const balanceTotal = balances.reduce((sum, entry) => sum + Number(entry.quantity), 0);
  if (!Number.isFinite(balanceTotal) || Math.abs(balanceTotal - total) > 0.000001) return null;

  // With locationId: return only that specific bin's stock.
  // Without locationId: aggregate all bins and unlocated stock for the warehouse.
  let matchingBalances;
  if (locationId) {
    matchingBalances = balances.filter((entry) =>
      entry.warehouse === location && entry.locationId === locationId
    );
  } else {
    matchingBalances = balances.filter((entry) => entry.warehouse === location);
  }

  const quantity = matchingBalances.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
}

export function inventoryError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
