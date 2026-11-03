import { allocateSequence, connectDB } from '@/lib/db.js';
import Fabric from '@/models/Fabric.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { recordInventoryMovement, sumAvailableFabricMeters } from '@/lib/inventory.js';

async function getFabric(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const fabrics = applyListQuery(await Fabric.find({}).sort({ name: 1 }), query, {
      searchFields: ['name', 'fabricCode', 'fabricType', 'composition', 'supplierName'],
    }).items;

    // Flatten all rolls across fabrics with fabric details
    const allRolls = [];
    fabrics.forEach(f => {
      (f.rolls || []).forEach(r => {
        allRolls.push({
          ...r,
          fabricId: f._id,
          fabricName: f.name,
          fabricCode: f.fabricCode,
          fabricType: f.fabricType,
          averageCostPerMeter: f.averageCostPerMeter,
        });
      });
    });

    return successResponse({
      fabrics,
      rolls: allRolls,
    });
  } catch (error) {
    return fromError(error);
  }
}

async function postFabric(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'ADD_ROLL') {
      const { fabricId, initialMeters, widthInches, weightKg, gsm, warehouseLocation, lotNumber } = body;
      const fabric = await Fabric.findByIdForUpdate(fabricId);
      if (!fabric) return errorResponse('Fabric type not found', 404);

      const sequence = await allocateSequence('fabric_roll');
      const rollNumber = `ROL-${new Date().getFullYear()}-${String(sequence).padStart(5, '0')}`;
      const barcode = `FAB${String(sequence).padStart(10, '0')}`;
      if (!Number.isFinite(Number(initialMeters)) || Number(initialMeters) <= 0) {
        return errorResponse('Enter a roll length greater than zero', 400);
      }

      const newRoll = {
        rollNumber,
        barcode,
        lotNumber: lotNumber || '',
        initialMeters: Number(initialMeters),
        remainingMeters: Number(initialMeters),
        widthInches: Number(widthInches) || 0,
        weightKg: Number(weightKg) || 0,
        gsm: Number(gsm) || 0,
        warehouseLocation: warehouseLocation || '',
        status: 'Available',
        inspectionNotes: '',
        defectsCount: 0,
      };

      fabric.rolls = [...(Array.isArray(fabric.rolls) ? fabric.rolls : []), newRoll];
      fabric.totalAvailableMeters = sumAvailableFabricMeters(fabric);
      fabric.movements = Array.isArray(fabric.movements) ? fabric.movements : [];
      recordInventoryMovement(fabric, {
        type: 'GRN_RECEIPT',
        quantity: Number(initialMeters),
        unit: 'Meters',
        referenceType: 'ManualReceipt',
        referenceNumber: 'MANUAL_ADD',
        sourceItemId: rollNumber,
        notes: `Added roll ${rollNumber}`,
      });
      fabric.movements[fabric.movements.length - 1].rollNumber = rollNumber;
      fabric.movements[fabric.movements.length - 1].meters = Number(initialMeters);
      fabric.movements[fabric.movements.length - 1].referenceDocument = 'MANUAL_ADD';
      fabric.movements[fabric.movements.length - 1].performedBy = '';

      await fabric.save();

      await AuditLog.create({
        userName: '',
        action: 'CREATE',
        module: 'Fabric Inventory',
        recordId: rollNumber,
        description: `Added new fabric roll ${rollNumber} (${initialMeters}m of ${fabric.name})`,
      });

      return successResponse({ roll: newRoll }, 'Roll registered successfully');
    }

    if (action === 'ISSUE_ROLL') {
      const { fabricCode, rollNumber, metersToConsume, destinationModule, referenceDoc, operator } = body;
      if (!['Cutting', 'Dyeing'].includes(destinationModule) || !String(referenceDoc || '').trim()) {
        return errorResponse('Select a valid destination and provide its reference number', 400);
      }
      const existingFabric = await Fabric.findOne({ fabricCode });
      const fabric = existingFabric ? await Fabric.findByIdForUpdate(existingFabric._id) : null;
      if (!fabric) return errorResponse('Fabric not found', 404);

      const roll = (fabric.rolls || []).find((item) => item.rollNumber === rollNumber);
      if (!roll) return errorResponse('Roll not found', 404);
      if (roll.status !== 'Available') {
        return errorResponse('Only fabric rolls available at a warehouse can be issued', 409);
      }

      const issueMeters = Number(metersToConsume);
      if (!Number.isFinite(issueMeters) || issueMeters <= 0) {
        return errorResponse('Enter a quantity greater than zero', 400);
      }
      if (issueMeters > roll.remainingMeters) {
        return errorResponse(`Requested meters (${issueMeters}) exceeds remaining meters (${roll.remainingMeters})`, 400);
      }
      if ((fabric.movements || []).some((movement) =>
        movement.rollNumber === rollNumber &&
        movement.type === (destinationModule === 'Cutting' ? 'ISSUE_CUTTING' : 'ISSUE_DYEING') &&
        movement.referenceDocument === referenceDoc
      )) {
        return errorResponse('This roll has already been issued to that reference', 409);
      }

      roll.remainingMeters -= issueMeters;
      if (roll.remainingMeters === 0) {
        roll.status = 'Exhausted';
      } else {
        roll.status = destinationModule === 'Cutting' ? 'IssuedToCutting' : 'IssuedToDyeing';
      }

      fabric.totalAvailableMeters = sumAvailableFabricMeters(fabric);

      recordInventoryMovement(fabric, {
        type: destinationModule === 'Cutting' ? 'ISSUE_CUTTING' : 'ISSUE_DYEING',
        quantity: issueMeters,
        unit: 'Meters',
        direction: 'OUT',
        referenceType: destinationModule,
        referenceNumber: referenceDoc,
        sourceItemId: rollNumber,
        notes: `Issued to ${destinationModule}`,
      });
      fabric.movements[fabric.movements.length - 1].rollNumber = rollNumber;
      fabric.movements[fabric.movements.length - 1].meters = issueMeters;
      fabric.movements[fabric.movements.length - 1].referenceDocument = referenceDoc;
      fabric.movements[fabric.movements.length - 1].performedBy = operator || '';

      await fabric.save();

      await AuditLog.create({
        userName: operator || '',
        action: 'UPDATE',
        module: 'Fabric Inventory',
        recordId: rollNumber,
        description: `Issued ${issueMeters}m from roll ${rollNumber} to ${destinationModule} (${referenceDoc})`,
      });

      return successResponse({ roll, remainingMeters: roll.remainingMeters }, 'Material issued successfully');
    }

    if (action === 'CREATE_FABRIC') {
      const {
        widthInches,
        defaultGsm,
        averageCostPerMeter,
        reorderLevelMeters,
        supplierName,
      } = body;
      const name = String(body.name || '').trim();
      const fabricType = String(body.fabricType || '').trim();
      const composition = String(body.composition || '').trim();
      const weave = String(body.weave || '').trim();
      if (!name || !fabricType || !composition || !weave ||
        averageCostPerMeter === undefined || averageCostPerMeter === '' ||
        !Number.isFinite(Number(averageCostPerMeter)) || Number(averageCostPerMeter) < 0) {
        return errorResponse('Fabric name, type, composition, weave and a valid cost are required', 400);
      }
      const sequence = await allocateSequence('fabric');
      const fabricCode = `FAB-${String(sequence).padStart(5, '0')}`;

      const newFabric = await Fabric.create({
        fabricCode,
        name,
        fabricType,
        composition,
        weave,
        widthInches: Number(widthInches) || 0,
        defaultGsm: Number(defaultGsm) || 0,
        averageCostPerMeter: Number(averageCostPerMeter),
        reorderLevelMeters: Number(reorderLevelMeters) || 0,
        supplierName: String(supplierName || '').trim(),
        totalAvailableMeters: 0,
        rolls: [],
        movements: [],
      });

      return successResponse({ fabric: newFabric }, 'Fabric master created');
    }

    if (action === 'UPDATE_FABRIC') {
      const fabric = await Fabric.findByIdForUpdate(body.fabricId);
      if (!fabric) return errorResponse('Fabric type not found', 404);
      const updates = pickFields(body, [
        'name', 'fabricType', 'composition', 'weave', 'widthInches', 'defaultGsm',
        'averageCostPerMeter', 'reorderLevelMeters', 'supplierName',
      ]);
      for (const field of ['name', 'fabricType', 'composition', 'weave']) {
        if (updates[field] !== undefined) {
          if (typeof updates[field] !== 'string') {
            return errorResponse('Fabric name, type, composition and weave must be text', 400);
          }
          updates[field] = updates[field].trim();
        }
        if (updates[field] !== undefined && !updates[field]) {
          return errorResponse('Fabric name, type, composition and weave cannot be empty', 400);
        }
      }
      for (const field of ['widthInches', 'defaultGsm', 'averageCostPerMeter', 'reorderLevelMeters']) {
        if (updates[field] === undefined) continue;
        if (updates[field] === '') {
          return errorResponse('Fabric dimensions, GSM, cost and reorder level must be non-negative valid numbers', 400);
        }
        const value = Number(updates[field]);
        if (!Number.isFinite(value) || value < 0) {
          return errorResponse('Fabric dimensions, GSM, cost and reorder level must be non-negative valid numbers', 400);
        }
        updates[field] = value;
      }
      Object.assign(fabric, updates);
      await fabric.save();
      return successResponse({ fabric }, 'Fabric updated');
    }

    if (action === 'DELETE_FABRIC') {
      const fabric = await Fabric.findByIdForUpdate(body.fabricId);
      if (!fabric) return errorResponse('Fabric type not found', 404);
      const linkedOrders = await PurchaseOrder.find({ 'items.stockItemId': fabric._id });
      if ((fabric.rolls || []).some((roll) => roll.status !== 'Voided') ||
        (fabric.movements || []).length || linkedOrders.length) {
        return errorResponse('Fabric referenced by stock, purchase orders or movement history cannot be deleted', 409);
      }
      await Fabric.deleteOne({ _id: fabric._id });
      return successResponse({ fabric }, 'Fabric deleted');
    }

    if (action === 'DELETE_ROLL') {
      const fabric = await Fabric.findByIdForUpdate(body.fabricId);
      if (!fabric) return errorResponse('Fabric type not found', 404);
      const roll = (fabric.rolls || []).find((item) => item.rollNumber === body.rollNumber);
      if (!roll) return errorResponse('Roll not found', 404);
      if (roll.status === 'Voided') return errorResponse('This roll has already been voided', 409);
      const hasIssues = (fabric.movements || []).some((movement) =>
        movement.rollNumber === roll.rollNumber &&
        ['ISSUE_CUTTING', 'ISSUE_DYEING'].includes(movement.type)
      );
      if (hasIssues || Number(roll.remainingMeters) !== Number(roll.initialMeters)) {
        return errorResponse('A roll with consumption history cannot be deleted', 409);
      }
      roll.status = 'Voided';
      fabric.totalAvailableMeters = sumAvailableFabricMeters(fabric);
      recordInventoryMovement(fabric, {
        type: 'ROLL_VOID',
        quantity: Number(roll.remainingMeters || 0),
        unit: 'Meters',
        direction: 'OUT',
        referenceType: 'ManualAdjustment',
        referenceNumber: roll.rollNumber,
        sourceItemId: roll.rollNumber,
        notes: `Voided roll ${roll.rollNumber}`,
      });
      await fabric.save();
      return successResponse({ fabric }, 'Roll deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getFabric, 'fabric');
export const POST = withAuthorization(postFabric, 'fabric', 'write');
