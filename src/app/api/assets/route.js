import { allocateSequence, connectDB } from '@/lib/db.js';
import { Asset, VehicleTrip } from '@/models/Asset.js';
import { AccountHead } from '@/models/Accounting.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, deleteRecord, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { postBalancedJournalEntry } from '@/lib/accounting.js';
import { resolveAndValidateMapping, validateMappingsPresent, getCompanyContext } from '@/lib/accounting-mappings.js';

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
      // Resolve depreciation accounts from company mappings
      const company = await getCompanyContext();
      const mappings = company && company.accountingMappings ? company.accountingMappings : {};
      const missingMappingErr = validateMappingsPresent(mappings, [
        'depreciationExpenseAccountCode',
        'accumulatedDepreciationAccountCode',
      ], 'asset depreciation posting');
      if (missingMappingErr) return errorResponse(missingMappingErr, 409);

      const expenseResult = await resolveAndValidateMapping(mappings, 'depreciationExpenseAccountCode', 'OperatingExpense');
      if (expenseResult.error) return errorResponse(expenseResult.error, 400);
      const accumResult = await resolveAndValidateMapping(mappings, 'accumulatedDepreciationAccountCode', 'Asset');
      if (accumResult.error) return errorResponse(accumResult.error, 400);

      const expenseAcc = expenseResult.account;
      const accumAcc = accumResult.account;

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

    if (action === 'DISPOSE_ASSET') {
      const { assetId, disposalDate, proceedsAmount, disposalReason } = body;
      const asset = await Asset.findByIdForUpdate(assetId);
      if (!asset) return errorResponse('Asset not found', 404);
      if (asset.status === 'Disposed') {
        return errorResponse('This asset has already been disposed', 409);
      }
      const proceeds = Number(proceedsAmount ?? 0);
      if (!Number.isFinite(proceeds) || proceeds < 0) {
        return errorResponse('Disposal proceeds must be a non-negative number', 400);
      }

      // Resolve accounting mappings
      const company = await getCompanyContext();
      const mappings = company && company.accountingMappings ? company.accountingMappings : {};
      const missingErr = validateMappingsPresent(mappings, [
        'fixedAssetAccountCode',
        'accumulatedDepreciationAccountCode',
      ], 'asset disposal');
      if (missingErr) return errorResponse(missingErr, 409);

      const assetAccResult = await resolveAndValidateMapping(mappings, 'fixedAssetAccountCode', 'Asset');
      if (assetAccResult.error) return errorResponse(assetAccResult.error, 400);
      const accumAccResult = await resolveAndValidateMapping(mappings, 'accumulatedDepreciationAccountCode', 'Asset');
      if (accumAccResult.error) return errorResponse(accumAccResult.error, 400);

      const originalCost = Number(asset.originalCostPKR || 0);
      const accumulatedDep = Number(asset.accumulatedDepreciationPKR || 0);
      const netBookValue = Math.max(0, originalCost - accumulatedDep);
      const gainLoss = proceeds - netBookValue;
      const isGain = gainLoss > 0;
      const isLoss = gainLoss < 0;

      // Build disposal journal lines
      // Dr: Accumulated Depreciation (reversal)
      // Dr: Cash/Proceeds (if any)
      // Dr: Loss on Disposal (if loss)
      // Cr: Fixed Asset Account (original cost)
      // Cr: Gain on Disposal (if gain)
      const disposalSourceKey = `ASSET_DISPOSE:${asset._id}:${Date.now()}`;
      const lines = [];

      // Reverse accumulated depreciation: Dr AccumulatedDepreciation
      if (accumulatedDep > 0) {
        lines.push({
          accountCode: accumAccResult.account.code,
          accountName: accumAccResult.account.name,
          debit: accumulatedDep,
          credit: 0,
          memo: `Reverse accumulated depreciation on ${asset.assetCode}`,
        });
      }

      // Credit the full asset cost
      lines.push({
        accountCode: assetAccResult.account.code,
        accountName: assetAccResult.account.name,
        debit: 0,
        credit: originalCost,
        memo: `Dispose fixed asset ${asset.assetCode} at original cost`,
      });

      // Handle proceeds: use bank/cash account mapping if available
      if (proceeds > 0) {
        const cashCode = mappings.cashAccountCode || mappings.bankAccountCode;
        if (!cashCode) return errorResponse('cashAccountCode or bankAccountCode must be configured to record disposal proceeds', 409);
        const cashAccResult = await resolveAndValidateMapping(mappings, mappings.cashAccountCode ? 'cashAccountCode' : 'bankAccountCode', 'Asset');
        if (cashAccResult.error) return errorResponse(cashAccResult.error, 400);
        lines.push({
          accountCode: cashAccResult.account.code,
          accountName: cashAccResult.account.name,
          debit: proceeds,
          credit: 0,
          memo: `Proceeds from disposal of ${asset.assetCode}`,
        });
      }

      // Gain or loss
      if (Math.abs(gainLoss) > 0.01) {
        // For gain: Cr Other Income; for loss: Dr OperatingExpense
        const gainLossCode = mappings.scrapWriteOffAccountCode || mappings.expenseAccountCode;
        if (!gainLossCode) return errorResponse('scrapWriteOffAccountCode or expenseAccountCode must be configured to record disposal gain/loss', 409);
        const gainLossAcc = await AccountHead.findOne({ code: gainLossCode });
        if (!gainLossAcc) return errorResponse(`Gain/loss account (${gainLossCode}) not found`, 409);
        if (isGain) {
          lines.push({
            accountCode: gainLossAcc.code,
            accountName: gainLossAcc.name,
            debit: 0,
            credit: gainLoss,
            memo: `Gain on disposal of ${asset.assetCode}`,
          });
        } else {
          lines.push({
            accountCode: gainLossAcc.code,
            accountName: gainLossAcc.name,
            debit: Math.abs(gainLoss),
            credit: 0,
            memo: `Loss on disposal of ${asset.assetCode}`,
          });
        }
      }

      await postBalancedJournalEntry({
        sourceKey: disposalSourceKey,
        voucherType: 'AssetDisposal',
        narration: `Asset disposal: ${asset.assetCode} — ${asset.assetName}. NBV: Rs. ${netBookValue.toLocaleString()}, Proceeds: Rs. ${proceeds.toLocaleString()}, ${isGain ? 'Gain' : isLoss ? 'Loss' : 'No gain/loss'}: Rs. ${Math.abs(gainLoss).toLocaleString()}`,
        referenceNumber: asset.assetCode,
        postedBy: user?.name || '',
        lines,
      });

      asset.status = 'Disposed';
      asset.disposalDate = disposalDate ? new Date(disposalDate) : new Date();
      asset.disposalProceeds = proceeds;
      asset.disposalReason = String(disposalReason || '').trim();
      asset.netBookValueAtDisposal = netBookValue;
      asset.gainLossOnDisposal = gainLoss;
      await asset.save();

      await AuditLog.create({
        userName: user?.name || '',
        action: 'DISPOSE',
        module: 'Assets',
        recordId: asset.assetCode,
        description: `Disposed asset ${asset.assetCode} — ${asset.assetName}. Original cost: Rs. ${originalCost}, Accumulated dep: Rs. ${accumulatedDep}, NBV: Rs. ${netBookValue}, Proceeds: Rs. ${proceeds}, ${isGain ? 'Gain' : 'Loss'}: Rs. ${Math.abs(gainLoss)}`,
      });

      return successResponse({
        asset,
        disposalSummary: {
          originalCost,
          accumulatedDepreciation: accumulatedDep,
          netBookValue,
          proceeds,
          gainLoss,
          outcome: isGain ? 'Gain on Disposal' : isLoss ? 'Loss on Disposal' : 'Break-even',
        },
      }, 'Asset disposed and accounting entry posted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getAssets, 'assets');
export const POST = withAuthorization(postAssets, 'assets', 'write');

