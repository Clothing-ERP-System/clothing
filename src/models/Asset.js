import { createMySQLModel } from '@/lib/mysql-model.js';

export const Asset = createMySQLModel('Asset', ['assetCode']);
export const VehicleTrip = createMySQLModel('VehicleTrip');
