import { connectDB } from '@/lib/db.js';
import Location from '@/models/Location.js';
import WarehouseTransfer from '@/models/WarehouseTransfer.js';
import Fabric from '@/models/Fabric.js';
import TrimItem from '@/models/Trims.js';
import DesignArticle from '@/models/Design.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';

async function getLocation(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const locations = applyListQuery(await Location.find({}).sort({ zone: 1, aisle: 1, rack: 1, shelf: 1, bin: 1 }), query, {
      searchFields: ['locationCode', 'zone', 'aisle', 'rack', 'shelf', 'bin'],
    }).items;
    return successResponse({ locations });
  } catch (error) {
    return fromError(error);
  }
}

async function postLocation(request, actor) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_LOCATION') {
      const { zone, aisle, rack, shelf, bin, locationCode } = body;
      const zoneStr = String(zone || '').trim();
      const aisleStr = String(aisle || '').trim();
      const rackStr = String(rack || '').trim();
      const shelfStr = String(shelf || '').trim();
      const binStr = String(bin || '').trim();
      const code = String(locationCode || '').trim();

      if (!zoneStr || !aisleStr || !rackStr || !shelfStr || !binStr) {
        return errorResponse('Zone, aisle, rack, shelf, and bin are all required', 400);
      }
      if (!code) {
        return errorResponse('Location code is required', 400);
      }
      // Check for duplicate location code
      const existingByCode = await Location.findOne({ locationCode: code });
      if (existingByCode) {
        return errorResponse('A location with this code already exists', 409);
      }
      // Check for duplicate zone/aisle/rack/shelf/bin combination
      const existingByPath = await Location.findOne({
        zone: zoneStr, aisle: aisleStr, rack: rackStr, shelf: shelfStr, bin: binStr,
      });
      if (existingByPath) {
        return errorResponse('A location with this path already exists', 409);
      }

      const location = await Location.create({
        locationCode: code,
        zone: zoneStr,
        aisle: aisleStr,
        rack: rackStr,
        shelf: shelfStr,
        bin: binStr,
        isActive: true,
        createdBy: actor?.name || '',
      });

      await AuditLog.create({
        userName: actor?.name || '',
        action: 'CREATE',
        module: 'Warehouse & Logistics',
        recordId: locationCode,
        description: `Created warehouse location ${locationCode}`,
      });

      return successResponse({ location }, 'Location created');
    }

    if (action === 'UPDATE_LOCATION') {
      const locationId = body.locationId;
      const location = await Location.findByIdForUpdate(locationId);
      if (!location) return errorResponse('Location not found', 404);

      const updates = pickFields(body, ['zone', 'aisle', 'rack', 'shelf', 'bin', 'locationCode', 'isActive']);
      if (updates.locationCode !== undefined) {
        const code = String(updates.locationCode || '').trim();
        if (!code) return errorResponse('Location code cannot be empty', 400);
        const dup = await Location.findOne({ locationCode: code });
        if (dup && dup._id !== location._id) {
          return errorResponse('A location with this code already exists', 409);
        }
      }
      if (updates.zone !== undefined || updates.aisle !== undefined || updates.rack !== undefined || updates.shelf !== undefined || updates.bin !== undefined) {
        const z = String(updates.zone !== undefined ? updates.zone : location.zone || '').trim();
        const a = String(updates.aisle !== undefined ? updates.aisle : location.aisle || '').trim();
        const r = String(updates.rack !== undefined ? updates.rack : location.rack || '').trim();
        const s = String(updates.shelf !== undefined ? updates.shelf : location.shelf || '').trim();
        const b = String(updates.bin !== undefined ? updates.bin : location.bin || '').trim();
        const dup = await Location.findOne({ zone: z, aisle: a, rack: r, shelf: s, bin: b });
        if (dup && dup._id !== location._id) {
          return errorResponse('A location with this path already exists', 409);
        }
      }
      Object.assign(location, updates);
      await location.save();
      return successResponse({ location }, 'Location updated');
    }

    if (action === 'DELETE_LOCATION') {
      const locationId = body.locationId;
      const location = await Location.findByIdForUpdate(locationId);
      if (!location) return errorResponse('Location not found', 404);

      // Prevent deletion if referenced by stock, transfers, or rolls
      const [transfers, fabrics, trims, designs] = await Promise.all([
        WarehouseTransfer.find({
          $or: [
            { 'sourceLocation.locationId': locationId },
            { 'destinationLocation.locationId': locationId },
          ],
        }),
        Fabric.findOne({ 'rolls.locationId': locationId }),
        TrimItem.findOne({ 'warehouseBalances.locationId': locationId }),
        DesignArticle.findOne({ 'warehouseBalances.locationId': locationId }),
      ]);
      if (transfers && transfers.length) {
        return errorResponse('Cannot delete location referenced by warehouse transfers', 409);
      }
      if (fabrics) {
        return errorResponse('Cannot delete location referenced by fabric rolls', 409);
      }
      if (trims) {
        return errorResponse('Cannot delete location referenced by trim stock balances', 409);
      }
      if (designs) {
        return errorResponse('Cannot delete location referenced by finished goods stock balances', 409);
      }

      await Location.deleteOne({ _id: locationId });
      return successResponse({ location }, 'Location deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getLocation, 'warehouse');
export const POST = withAuthorization(postLocation, 'warehouse', 'write');
