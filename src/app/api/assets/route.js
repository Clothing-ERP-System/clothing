import { allocateSequence, connectDB } from '@/lib/db.js';
import { Asset, VehicleTrip } from '@/models/Asset.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const assets = await Asset.find({}).sort({ assetName: 1 });
    const trips = await VehicleTrip.find({}).sort({ createdAt: -1 });
    return successResponse({ assets, trips });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_ASSET') {
      const { assetName, category, brandModel, originalCostPKR, locationFloor } = body;
      const sequence = await allocateSequence('asset');
      const assetCode = `AST-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      const cost = Number(originalCostPKR);
      if (!assetName || !category || !Number.isFinite(cost) || cost < 0) {
        return errorResponse('Asset name, category and a valid purchase cost are required', 400);
      }

      const asset = await Asset.create({
        assetCode,
        assetName,
        category,
        brandModel: brandModel || '',
        originalCostPKR: cost,
        accumulatedDepreciationPKR: 0,
        currentBookValuePKR: cost,
        locationFloor: locationFloor || '',
        status: 'Operational',
      });

      return successResponse({ asset }, 'Asset registered');
    }

    if (action === 'LOG_MAINTENANCE') {
      const { assetId, workDone, costPKR, technician } = body;
      const asset = await Asset.findById(assetId);
      if (!asset) return errorResponse('Asset not found', 404);

      asset.maintenanceHistory.push({
        serviceDate: new Date(),
        workDone,
        costPKR: Number(costPKR) || 0,
        technician: technician || '',
      });
      await asset.save();

      return successResponse({ asset }, 'Maintenance record logged');
    }

    if (action === 'LOG_TRIP') {
      const { vehicleRegistrationNumber, driverName, startLocation, destinationLocation, purpose, kilometersTraveled, fuelCostPKR, challanReference } = body;
      const trip = await VehicleTrip.create({
        vehicleRegistrationNumber,
        driverName,
        startLocation: startLocation || '',
        destinationLocation: destinationLocation || '',
        purpose: purpose || '',
        kilometersTraveled: Number(kilometersTraveled) || 0,
        fuelCostPKR: Number(fuelCostPKR) || 0,
        challanReference: challanReference || '',
      });

      return successResponse({ trip }, 'Vehicle trip and fuel logged');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
