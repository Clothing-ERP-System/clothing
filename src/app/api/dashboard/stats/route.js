import { connectDB } from '@/lib/db.js';
import SalesOrder from '@/models/SalesOrder.js';
import { POSTransaction } from '@/models/POS.js';
import Fabric from '@/models/Fabric.js';
import ProductionOrder from '@/models/ProductionOrder.js';
import QualityInspection from '@/models/QualityInspection.js';
import Customer from '@/models/Customer.js';
import Supplier from '@/models/Supplier.js';
import TrimItem from '@/models/Trims.js';
import CuttingOrder from '@/models/CuttingOrder.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

const EMPTY_DASHBOARD_STATS = {
  kpis: {
    totalRevenue: 0,
    wholesaleSalesTotal: 0,
    retailPosSalesTotal: 0,
    totalFabricMeters: 0,
    totalRollsCount: 0,
    availableRollsCount: 0,
    totalCompletedPieces: 0,
    totalTargetPieces: 0,
    totalWipPieces: 0,
    overallEfficiency: 0,
    qualityPassRate: 0,
    totalReceivables: 0,
    totalPayables: 0,
  },
  alerts: {
    lowStockTrimsCount: 0,
    lowStockTrims: [],
    pendingCuttingOrdersCount: 0,
  },
  productionTrends: [
    { day: 'Mon', target: 0, actual: 0, efficiency: 0 },
    { day: 'Tue', target: 0, actual: 0, efficiency: 0 },
    { day: 'Wed', target: 0, actual: 0, efficiency: 0 },
    { day: 'Thu', target: 0, actual: 0, efficiency: 0 },
    { day: 'Fri', target: 0, actual: 0, efficiency: 0 },
    { day: 'Sat', target: 0, actual: 0, efficiency: 0 },
  ],
  fabricConsumptionByArticle: [],
  recentAudits: [],
};

export async function GET() {
  try {
    try {
      await connectDB();
    } catch (dbError) {
      console.warn('Database unconfigured or unreachable. Providing clean empty dashboard state:', dbError.message);
      return successResponse(EMPTY_DASHBOARD_STATS, 'Database offline, default empty stats returned');
    }

    // 1. Sales Calculation
    const salesOrders = (await SalesOrder.find({}).catch(() => [])) || [];
    const posTransactions = (await POSTransaction.find({}).catch(() => [])) || [];

    const wholesaleSalesTotal = salesOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
    const retailPosSalesTotal = posTransactions.reduce((sum, t) => sum + (t.grandTotal || 0), 0);
    const totalRevenue = wholesaleSalesTotal + retailPosSalesTotal;

    // 2. Production Metrics
    const productionOrders = (await ProductionOrder.find({}).catch(() => [])) || [];
    const totalTargetPieces = productionOrders.reduce((sum, p) => sum + (p.targetQuantity || 0), 0);
    const totalCompletedPieces = productionOrders.reduce((sum, p) => sum + (p.completedQuantity || 0), 0);
    const totalWipPieces = productionOrders.reduce((sum, p) => sum + (p.wipQuantity || 0), 0);
    const overallEfficiency = totalTargetPieces > 0 ? Math.round((totalCompletedPieces / totalTargetPieces) * 100) : 0;

    // 3. Fabric Inventory
    const fabrics = (await Fabric.find({}).catch(() => [])) || [];
    let totalFabricMeters = 0;
    let totalRollsCount = 0;
    let availableRollsCount = 0;
    fabrics.forEach((f) => {
      totalFabricMeters += f.totalAvailableMeters || 0;
      if (f.rolls) {
        totalRollsCount += f.rolls.length;
        availableRollsCount += f.rolls.filter((r) => r.status === 'Available').length;
      }
    });

    // 4. Quality Metrics
    const qcs = (await QualityInspection.find({}).catch(() => [])) || [];
    let totalQcChecked = 0;
    let totalQcPassed = 0;
    qcs.forEach((q) => {
      totalQcChecked += q.totalSampleChecked || 0;
      totalQcPassed += q.passedQuantity || 0;
    });
    const qualityPassRate = totalQcChecked > 0 ? Number(((totalQcPassed / totalQcChecked) * 100).toFixed(1)) : 0;

    // 5. Receivables and Payables
    const customers = (await Customer.find({}).catch(() => [])) || [];
    const totalReceivables = customers.reduce((sum, c) => sum + (c.currentReceivableBalance || 0), 0);

    const suppliers = (await Supplier.find({}).catch(() => [])) || [];
    const totalPayables = suppliers.reduce((sum, s) => sum + (s.currentBalance || 0), 0);

    // 6. Alerts
    const lowStockTrims = (await TrimItem.find({ $expr: { $lte: ['$currentStock', '$minimumStock'] } }).catch(() => [])) || [];
    const pendingCutting = (await CuttingOrder.find({ status: { $ne: 'TransferredToStitching' } }).catch(() => [])) || [];
    const recentAudits = (await AuditLog.find({}).sort({ createdAt: -1 }).limit(6).catch(() => [])) || [];

    // Compute live production trends if dailyLogs exist
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const trendMap = {};
    daysOfWeek.forEach((d) => {
      trendMap[d] = { day: d, target: 0, actual: 0 };
    });

    productionOrders.forEach((order) => {
      (order.dailyLogs || []).forEach((log) => {
        const dayName = new Date(log.date).toLocaleDateString('en-US', { weekday: 'short' });
        if (trendMap[dayName]) {
          trendMap[dayName].actual += log.piecesProduced || 0;
        }
      });
    });

    const productionTrends = daysOfWeek.map((d) => ({
      day: d,
      target: trendMap[d].target,
      actual: trendMap[d].actual,
      efficiency: trendMap[d].target > 0 ? Math.round((trendMap[d].actual / trendMap[d].target) * 100) : 0,
    }));

    return successResponse(
      {
        kpis: {
          totalRevenue,
          wholesaleSalesTotal,
          retailPosSalesTotal,
          totalFabricMeters,
          totalRollsCount,
          availableRollsCount,
          totalCompletedPieces,
          totalTargetPieces,
          totalWipPieces,
          overallEfficiency,
          qualityPassRate,
          totalReceivables,
          totalPayables,
        },
        alerts: {
          lowStockTrimsCount: lowStockTrims.length,
          lowStockTrims: lowStockTrims.map((t) => ({
            name: t.name,
            current: t.currentStock,
            min: t.minimumStock,
            unit: t.unit,
          })),
          pendingCuttingOrdersCount: pendingCutting.length,
        },
        productionTrends,
        fabricConsumptionByArticle: [],
        recentAudits,
      },
      'Dashboard metrics fetched successfully'
    );
  } catch (error) {
    console.error('Dashboard stats unexpected error:', error);
    return successResponse(EMPTY_DASHBOARD_STATS, 'Safe fallback dashboard stats');
  }
}
