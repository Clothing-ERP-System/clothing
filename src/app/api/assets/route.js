import { allocateSequence, connectDB } from '@/lib/db.js';
import { Asset, VehicleTrip } from '@/models/Asset.js';
import { AccountHead } from '@/models/Accounting.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, deleteRecord, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { postBalancedJournalEntry } from '@/lib/accounting.js';

async function getAssets(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const assets = applyListQuery(await Asset.find({}).sort({ assetName: 1 }), query, {
      searchFields: ['assetCode', 'assetName', 'category', 'brandModel', 'locationFloor'],
    }).items;
    const trips = applyListQuery(await VehicleTrip.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['vehicleRegistrationNumber', 'driverName', 'startLocation', 'destinationLocation', 'purpose'],
    }).items;
    const financialAccounts = await AccountHead.find({}).sort({ code: 1 });
    return successResponse({
      assets,
      trips,
      financialAccounts: financialAccounts.map(({ code, name, type }) => ({ code, name, type })),
    });
  } catch (error) {
    return fromError(error);
  }
}

async function postAssets(request, user) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_ASSET') {
      const { assetName, category, brandModel, originalCostPKR, locationFloor, usefulLifeYears, salvageValuePKR } = body;
      const name = String(assetName || '').trim();
      const assetCategory = String(category || '').trim();
      const cost = Number(originalCostPKR);
      if (!name || !assetCategory || !Number.isFinite(cost) || cost < 0) {
        return errorResponse('Asset name, category and a valid purchase cost are required', 400);
      }
      const sequence = await allocateSequence('asset');
      const assetCode = `AST-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const asset = await Asset.create({
        assetCode,
        assetName: name,
        category: assetCategory,
        brandModel: brandModel || '',
        originalCostPKR: cost,
        accumulatedDepreciationPKR: 0,
        currentBookValuePKR: cost,
        locationFloor: locationFloor || '',
        usefulLifeYears: Number(usefulLifeYears) || 5,
        salvageValuePKR: Number(salvageValuePKR) || 0,
        status: 'Operational',
        maintenanceHistory: [],
        depreciationHistory: [],
      });

      return successResponse({ asset }, 'Asset registered');
    }

    if (action === 'APPLY_DEPRECIATION') {
      const { assetId, amountPKR, expenseAccountCode, accumulatedAccountCode, notes } = body;
      const asset = await Asset.findByIdForUpdate(assetId);
      if (!asset) return errorResponse('Asset not found', 404);

      const currentBookValue = Number(asset.currentBookValuePKR ?? asset.originalCostPKR ?? 0);
      const depAmount = Number(amountPKR);
      if (!Number.isFinite(depAmount) || depAmount <= 0) {
        return errorResponse('Depreciation amount must be a positive number', 400);
      }
      if (depAmount > currentBookValue) {
        return errorResponse(`Depreciation amount cannot exceed current book value (Rs. ${currentBookValue.toLocaleString()})`, 400);
      }

      let journalEntryId = null;
      if (expenseAccountCode && accumulatedAccountCode) {
        const expenseAcc = await AccountHead.findOne({ code: expenseAccountCode });
        const accumAcc = await AccountHead.findOne({ code: accumulatedAccountCode });
        if (!expenseAcc || !accumAcc) {
          return errorResponse('Selected depreciation accounts do not exist', 400);
        }

        const sequence = await allocateSequence('asset_depreciation');
        const sourceKey = `ASSET_DEP:${asset.assetCode}:${sequence}`;
        const { entry } = await postBalancedJournalEntry({
          sourceKey,
          voucherType: 'DepreciationVoucher',
          narration: `Depreciation for asset ${asset.assetCode} - ${asset.assetName}`,
          referenceNumber: asset.assetCode,
          postedBy: user?.name || 'System',
          lines: [
            {
              accountCode: expenseAcc.code,
              debit: depAmount,
              credit: 0,
              memo: `Depreciation expense - ${asset.assetName}`,
            },
            {
              accountCode: accumAcc.code,
              debit: 0,
              credit: depAmount,
              memo: `Accumulated depreciation - ${asset.assetName}`,
            },
          ],
        });
        journalEntryId = entry._id;
      }

      asset.accumulatedDepreciationPKR = (Number(asset.accumulatedDepreciationPKR) || 0) + depAmount;
      asset.currentBookValuePKR = Math.max(0, currentBookValue - depAmount);
      asset.depreciationHistory = Array.isArray(asset.depreciationHistory) ? asset.depreciationHistory : [];
      asset.depreciationHistory.push({
        date: new Date(),
        amountPKR: depAmount,
        bookValueAfter: asset.currentBookValuePKR,
        financialEntryId: journalEntryId,
        notes: String(notes || '').trim(),
      });
      await asset.save();

      await AuditLog.create({
        userName: user?.name || '',
        action: 'UPDATE',
        module: 'Assets & Maintenance',
        recordId: asset.assetCode,
        description: `Applied depreciation of Rs. ${depAmount.toLocaleString()} to ${asset.assetName}. New book value: Rs. ${asset.currentBookValuePKR.toLocaleString()}`,
      });

      return successResponse({ asset }, 'Depreciation recorded successfully');
    }

    if (action === 'LOG_MAINTENANCE') {
      const { assetId, workDone, costPKR, technician } = body;
      const asset = await Asset.findByIdForUpdate(assetId);
      if (!asset) return errorResponse('Asset not found', 404);
      const cost = Number(costPKR ?? 0);
      if (!String(workDone || '').trim() || !Number.isFinite(cost) || cost < 0) {
        return errorResponse('Maintenance description and a non-negative valid cost are required', 400);
      }

      asset.maintenanceHistory = Array.isArray(asset.maintenanceHistory) ? asset.maintenanceHistory : [];
      asset.maintenanceHistory.push({
        serviceDate: new Date(),
        workDone: String(workDone).trim(),
        costPKR: cost,
        technician: technician || '',
      });
      await asset.save();

      return successResponse({ asset }, 'Maintenance record logged');
    }

    if (action === 'LOG_TRIP') {
      const { vehicleRegistrationNumber, driverName, startLocation, destinationLocation, purpose, kilometersTraveled, fuelCostPKR, challanReference } = body;
      const vehicle = String(vehicleRegistrationNumber || '').trim();
      const driver = String(driverName || '').trim();
      const kilometers = Number(kilometersTraveled);
      const fuelCost = Number(fuelCostPKR ?? 0);
      if (!vehicle || !driver || !String(startLocation || '').trim() ||
        !String(destinationLocation || '').trim() || !Number.isFinite(kilometers) || kilometers <= 0 ||
        !Number.isFinite(fuelCost) || fuelCost < 0) {
        return errorResponse('Vehicle, driver, locations and valid travel and fuel quantities are required', 400);
      }
      const trip = await VehicleTrip.create({
        vehicleRegistrationNumber: vehicle,
        driverName: driver,
        startLocation: startLocation || '',
        destinationLocation: destinationLocation || '',
        purpose: purpose || '',
        kilometersTraveled: kilometers,
        fuelCostPKR: fuelCost,
        challanReference: challanReference || '',
      });

      return successResponse({ trip }, 'Vehicle trip and fuel logged');
    }

    if (action === 'UPDATE_ASSET') {
      const asset = await Asset.findByIdForUpdate(body.assetId);
      if (!asset) return errorResponse('Asset not found', 404);
      const updates = pickFields(body, [
        'assetName', 'category', 'brandModel', 'locationFloor', 'status',
      ]);
      if (updates.assetName !== undefined) updates.assetName = String(updates.assetName).trim();
      if (updates.category !== undefined) updates.category = String(updates.category).trim();
      if (updates.assetName !== undefined && !updates.assetName ||
        updates.category !== undefined && !updates.category) {
        return errorResponse('Asset name and category cannot be empty', 400);
      }
      Object.assign(asset, updates);
      await asset.save();
      return successResponse({ asset }, 'Asset updated');
    }

    if (action === 'DELETE_ASSET') {
      const asset = await Asset.findById(body.assetId);
      if (!asset) return errorResponse('Asset not found', 404);
      if ((asset.maintenanceHistory || []).length) {
        return errorResponse('An asset with maintenance history cannot be deleted', 409);
      }
      if ((asset.depreciationHistory || []).length) {
        return errorResponse('An asset with depreciation history cannot be deleted', 409);
      }
      await Asset.deleteOne({ _id: asset._id });
      return successResponse({ asset }, 'Asset deleted');
    }

    if (action === 'DELETE_TRIP') {
      const trip = await deleteRecord(VehicleTrip, body.tripId);
      if (!trip) return errorResponse('Trip not found', 404);
      return successResponse({ trip }, 'Trip deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getAssets, 'assets');
export const POST = withAuthorization(postAssets, 'assets', 'write');

