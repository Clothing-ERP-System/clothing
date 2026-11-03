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
import { successResponse, fromError } from '@/lib/api-response.js';
import { withAuthorization } from '@/lib/authorization.js';

const dayMilliseconds = 24 * 60 * 60 * 1000;

function numericValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function weekdaysInclusive(start, end) {
  const startTime = start.getTime();
  const dayCount = Math.floor((end.getTime() - startTime) / dayMilliseconds) + 1;
  if (dayCount <= 0) return 0;

  const completeWeeks = Math.floor(dayCount / 7);
  const remainingDays = dayCount % 7;
  let sundays = completeWeeks;
  for (let offset = 0; offset < remainingDays; offset += 1) {
    if (new Date(startTime + (completeWeeks * 7 + offset) * dayMilliseconds).getUTCDay() === 0) {
      sundays += 1;
    }
  }
  return dayCount - sundays;
}

function revenueChangePercent(records, now = new Date()) {
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const previousDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const previousMonth = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, '0')}`;
  let currentRevenue = 0;
  let previousRevenue = 0;

  for (const record of records) {
    const key = dateKey(record.orderDate || record.createdAt);
    if (!key) continue;
    const month = key.slice(0, 7);
    if (month === currentMonth) currentRevenue += numericValue(record.grandTotal);
    if (month === previousMonth) previousRevenue += numericValue(record.grandTotal);
  }

  return previousRevenue > 0
    ? Number((((currentRevenue - previousRevenue) / previousRevenue) * 100).toFixed(1))
    : null;
}

function productionTrendData(productionOrders, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * dayMilliseconds);
  const dates = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(monday.getTime() + index * dayMilliseconds);
    return {
      key: date.toISOString().slice(0, 10),
      day: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      target: 0,
      actual: 0,
    };
  });
  const trendByDate = new Map(dates.map((item) => [item.key, item]));

  for (const order of productionOrders) {
    const startKey = dateKey(order.startDate);
    const endKey = dateKey(order.targetDate);
    if (startKey && endKey) {
      const start = new Date(`${startKey}T00:00:00.000Z`);
      const end = new Date(`${endKey}T00:00:00.000Z`);
      const workdays = weekdaysInclusive(start, end);
      if (workdays > 0) {
        const dailyTarget = numericValue(order.targetQuantity) / workdays;
        for (const trend of dates) {
          if (trend.key >= startKey && trend.key <= endKey) trend.target += dailyTarget;
        }
      }
    }

    for (const log of Array.isArray(order.dailyLogs) ? order.dailyLogs : []) {
      const trend = trendByDate.get(dateKey(log.date));
      if (trend) trend.actual += numericValue(log.piecesProduced);
    }
  }

  return dates.map(({ day, target, actual }) => ({
    day,
    target: Math.round(target),
    actual,
    efficiency: target > 0 ? Math.round((actual / target) * 100) : 0,
  }));
}

async function getDashboardStats() {
  try {
    await connectDB();
    const [
      salesOrders,
      posTransactions,
      productionOrders,
      fabrics,
      qcs,
      customers,
      suppliers,
      lowStockTrims,
      pendingCutting,
      recentAudits,
      cuttingOrders,
    ] = await Promise.all([
      SalesOrder.find({}),
      POSTransaction.find({}),
      ProductionOrder.find({}),
      Fabric.find({}),
      QualityInspection.find({}),
      Customer.find({}),
      Supplier.find({}),
      TrimItem.find({ $expr: { $lte: ['$currentStock', '$minimumStock'] } }),
      CuttingOrder.find({ status: { $ne: 'TransferredToStitching' } }),
      AuditLog.find({}).sort({ createdAt: -1 }).limit(6),
      CuttingOrder.find({}),
    ]);

    const wholesaleSalesTotal = salesOrders
      .filter((order) => order.status !== 'Cancelled')
      .reduce((sum, order) => sum + numericValue(order.grandTotal), 0);
    const retailPosSalesTotal = posTransactions
      .filter((transaction) => transaction.status !== 'Cancelled')
      .reduce((sum, transaction) => sum + numericValue(transaction.grandTotal), 0);
    const totalRevenue = wholesaleSalesTotal + retailPosSalesTotal;

    const totalTargetPieces = productionOrders.reduce((sum, order) => sum + numericValue(order.targetQuantity), 0);
    const totalCompletedPieces = productionOrders.reduce((sum, order) => sum + numericValue(order.completedQuantity), 0);
    const totalWipPieces = productionOrders.reduce((sum, order) => sum + numericValue(order.wipQuantity), 0);
    const overallEfficiency = totalTargetPieces > 0 ? Math.round((totalCompletedPieces / totalTargetPieces) * 100) : 0;

    let totalFabricMeters = 0;
    let totalRollsCount = 0;
    let availableRollsCount = 0;
    fabrics.forEach((fabric) => {
      if (Array.isArray(fabric.rolls)) {
        const activeRolls = fabric.rolls.filter((roll) => roll.status !== 'Voided');
        totalFabricMeters += activeRolls.reduce((sum, roll) => sum + numericValue(roll.remainingMeters), 0);
        totalRollsCount += activeRolls.length;
        availableRollsCount += activeRolls.filter((roll) => roll.status === 'Available').length;
      }
    });

    let totalQcChecked = 0;
    let totalQcPassed = 0;
    qcs.forEach((inspection) => {
      totalQcChecked += numericValue(inspection.totalSampleChecked);
      totalQcPassed += numericValue(inspection.passedQuantity);
    });
    const qualityPassRate = totalQcChecked > 0 ? Number(((totalQcPassed / totalQcChecked) * 100).toFixed(1)) : 0;

    const totalReceivables = customers.reduce((sum, customer) => sum + numericValue(customer.currentReceivableBalance), 0);
    const totalPayables = suppliers.reduce((sum, supplier) => sum + numericValue(supplier.currentBalance), 0);
    const productionTrends = productionTrendData(productionOrders);
    const consumptionByArticle = new Map();
    cuttingOrders.forEach((order) => {
      const meters = numericValue(order.actualFabricConsumedMeters);
      if (meters <= 0) return;
      const key = order.designCode || order.designTitle || 'Unassigned';
      const current = consumptionByArticle.get(key) || {
        article: order.designTitle || order.designCode || 'Unassigned',
        designCode: order.designCode || '',
        consumedMeters: 0,
      };
      current.consumedMeters += meters;
      consumptionByArticle.set(key, current);
    });
    const fabricConsumptionByArticle = [...consumptionByArticle.values()]
      .sort((left, right) => right.consumedMeters - left.consumedMeters);

    return successResponse(
      {
        kpis: {
          totalRevenue,
          revenueChangePercent: revenueChangePercent([...salesOrders, ...posTransactions]),
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
        fabricConsumptionByArticle,
        recentAudits,
      },
      'Dashboard metrics fetched successfully'
    );
  } catch (error) {
    console.error('Dashboard stats unexpected error:', error);
    return fromError(error);
  }
}

export const GET = withAuthorization(getDashboardStats, 'dashboard');
