import { allocateSequence, connectDB } from '@/lib/db.js';
import Fabric from '@/models/Fabric.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const fabrics = await Fabric.find({}).sort({ name: 1 });

    // Flatten all rolls across fabrics with fabric details
    const allRolls = [];
    fabrics.forEach(f => {
      (f.rolls || []).forEach(r => {
        allRolls.push({
          ...r,
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
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'ADD_ROLL') {
      const { fabricId, initialMeters, widthInches, weightKg, gsm, warehouseLocation, lotNumber } = body;
      const fabric = await Fabric.findById(fabricId);
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

      fabric.rolls.push(newRoll);
      fabric.totalAvailableMeters = (fabric.totalAvailableMeters || 0) + Number(initialMeters);
      fabric.movements.push({
        type: 'GRN_RECEIPT',
        rollNumber,
        meters: Number(initialMeters),
        referenceDocument: 'MANUAL_ADD',
        performedBy: '',
        notes: `Added roll ${rollNumber}`,
      });

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
      const fabric = await Fabric.findOne({ fabricCode });
      if (!fabric) return errorResponse('Fabric not found', 404);

      const roll = fabric.rolls.find(r => r.rollNumber === rollNumber);
      if (!roll) return errorResponse('Roll not found', 404);

      const issueMeters = Number(metersToConsume);
      if (!Number.isFinite(issueMeters) || issueMeters <= 0) {
        return errorResponse('Enter a quantity greater than zero', 400);
      }
      if (issueMeters > roll.remainingMeters) {
        return errorResponse(`Requested meters (${issueMeters}) exceeds remaining meters (${roll.remainingMeters})`, 400);
      }

      roll.remainingMeters -= issueMeters;
      if (roll.remainingMeters === 0) {
        roll.status = 'Exhausted';
      } else {
        roll.status = destinationModule === 'Cutting' ? 'IssuedToCutting' : 'IssuedToDyeing';
      }

      fabric.totalAvailableMeters = Math.max(0, (fabric.totalAvailableMeters || 0) - issueMeters);

      fabric.movements.push({
        type: destinationModule === 'Cutting' ? 'ISSUE_CUTTING' : 'ISSUE_DYEING',
        rollNumber,
        meters: issueMeters,
        referenceDocument: referenceDoc || '',
        performedBy: operator || '',
        notes: `Issued to ${destinationModule}`,
      });

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
      const { name, fabricType, composition, weave, widthInches, defaultGsm, averageCostPerMeter, reorderLevelMeters, supplierName } = body;
      if (!name || !fabricType || !composition || !weave || !Number.isFinite(Number(averageCostPerMeter))) {
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
        supplierName: supplierName || '',
        totalAvailableMeters: 0,
        rolls: [],
        movements: [],
      });

      return successResponse({ fabric: newFabric }, 'Fabric master created');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
