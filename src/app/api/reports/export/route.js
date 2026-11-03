import { NextResponse } from 'next/server';
import { withAuthorization } from '@/lib/authorization.js';
import { errorResponse } from '@/lib/api-response.js';
import { generatePdfReport, generateXlsxReport } from '@/lib/report-export.js';
import ProductionOrder from '@/models/ProductionOrder.js';
import Fabric from '@/models/Fabric.js';
import TrimItem from '@/models/Trims.js';
import SalesOrder from '@/models/SalesOrder.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import { PayrollSlip } from '@/models/HR.js';
import { JournalEntry } from '@/models/Accounting.js';

function parseDate(value, label) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    const error = new Error(`${label} must use YYYY-MM-DD format`);
    error.status = 400;
    throw error;
  }
  return new Date(`${value}T00:00:00Z`);
}

function recordDate(record) {
  const value = record.createdAt || record.orderDate || record.productionDate || record.date;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function inRange(record, from, to) {
  if (!from && !to) return true;
  const date = recordDate(record);
  if (!date) return false;
  return (!from || date >= from) && (!to || date < new Date(to.getTime() + 86400000));
}

function recordBranch(record) {
  return String(record.branch || record.branchName || record.outletBranch || '');
}

function buildReport(type, sourceRecords) {
  if (type === 'production') {
    const records = sourceRecords.production.map((record) => {
      const target = Number(record.targetQuantity) || 0;
      const actual = Number(record.completedQuantity) || 0;
      return {
        'Order #': record.productionOrderNumber || '',
        Line: record.stitchingLine || '',
        Article: record.articleName || record.designCode || '',
        'Target (Pcs)': target,
        'Completed (Pcs)': actual,
        'Efficiency (%)': target ? Math.round((actual / target) * 100) : 0,
        Rejects: Number(record.rejectedQuantity) || 0,
        Status: record.status || '',
      };
    });
    return { title: 'Production Output Report', records, totals: { orders: records.length, target: records.reduce((sum, row) => sum + row['Target (Pcs)'], 0), completed: records.reduce((sum, row) => sum + row['Completed (Pcs)'], 0), rejects: records.reduce((sum, row) => sum + row.Rejects, 0) } };
  }
  if (type === 'fabric') {
    const records = sourceRecords.fabrics.map((fabric) => {
      const rolls = Array.isArray(fabric.rolls) ? fabric.rolls : [];
      const activeRolls = rolls.filter((roll) => roll.status !== 'Voided');
      const received = rolls.reduce((sum, roll) => sum + (Number(roll.initialMeters) || 0), 0);
      const remaining = activeRolls.reduce((sum, roll) => sum + (Number(roll.remainingMeters) || 0), 0);
      const rate = Number(fabric.averageCostPerMeter) || 0;
      return {
        Code: fabric.fabricCode || '',
        'Fabric Name': fabric.name || '',
        Type: fabric.fabricType || '',
        Rolls: activeRolls.length,
        'Received (m)': received,
        'Remaining (m)': remaining,
        'Consumed (m)': Math.max(0, received - remaining),
        'Rate (PKR)': rate,
        'Valuation (PKR)': remaining * rate,
      };
    });
    return { title: 'Fabric Stock & Consumption Report', records, totals: { varieties: records.length, received: records.reduce((sum, row) => sum + row['Received (m)'], 0), remaining: records.reduce((sum, row) => sum + row['Remaining (m)'], 0), valuation: records.reduce((sum, row) => sum + row['Valuation (PKR)'], 0) } };
  }
  if (type === 'valuation') {
    const records = [
      ...sourceRecords.fabrics.map((fabric) => {
        const remaining = (Array.isArray(fabric.rolls) ? fabric.rolls : [])
          .filter((roll) => roll.status !== 'Voided')
          .reduce((sum, roll) => sum + (Number(roll.remainingMeters) || 0), 0);
        const rate = Number(fabric.averageCostPerMeter) || 0;
        return { Item: fabric.name || '', Category: 'Fabric', 'Current Stock': remaining, 'Unit Cost': rate, 'Total Valuation (PKR)': remaining * rate };
      }),
      ...sourceRecords.trims.map((trim) => {
        const stock = Number(trim.currentStock) || 0;
        const cost = Number(trim.unitCost) || 0;
        return { Item: trim.name || '', Category: trim.category || 'Trims', 'Current Stock': stock, 'Unit Cost': cost, 'Total Valuation (PKR)': stock * cost };
      }),
    ];
    return { title: 'Current Stock Valuation Report', records, totals: { items: records.length, valuation: records.reduce((sum, row) => sum + row['Total Valuation (PKR)'], 0) } };
  }
  if (type === 'sales') {
    const records = sourceRecords.sales.map((order) => {
      const itemsCount = Array.isArray(order.items) ? order.items.length : 0;
      const totalAmount = Number(order.grandTotal ?? order.totalAmount ?? 0);
      return {
        'Order #': order.orderNumber || order.salesOrderNumber || '',
        Customer: order.customerName || '',
        Date: recordDate(order)?.toISOString().slice(0, 10) || '',
        Branch: order.outletBranch || order.branch || '',
        Items: itemsCount,
        'Total (PKR)': totalAmount,
        Status: order.status || '',
      };
    });
    return {
      title: 'Sales & Revenue Orders Report',
      records,
      totals: {
        orders: records.length,
        revenue: records.reduce((sum, row) => sum + row['Total (PKR)'], 0),
      },
    };
  }
  if (type === 'procurement') {
    const records = sourceRecords.procurement.map((po) => {
      const itemsCount = Array.isArray(po.items) ? po.items.length : 0;
      const totalAmount = Number(po.totalAmount ?? po.grandTotal ?? 0);
      return {
        'PO #': po.poNumber || '',
        Supplier: po.supplierName || '',
        Date: recordDate(po)?.toISOString().slice(0, 10) || '',
        Items: itemsCount,
        'Total (PKR)': totalAmount,
        Status: po.status || '',
        Payment: po.paymentStatus || 'Pending',
      };
    });
    return {
      title: 'Procurement & Purchase Orders Report',
      records,
      totals: {
        orders: records.length,
        procurement: records.reduce((sum, row) => sum + row['Total (PKR)'], 0),
      },
    };
  }
  if (type === 'hr') {
    const records = sourceRecords.hr.map((slip) => {
      const netPayable = Number(slip.netPayablePKR || 0);
      return {
        'Slip #': slip.payrollKey || '',
        Employee: slip.employeeName || '',
        Code: slip.employeeCode || '',
        Designation: slip.designation || '',
        Month: slip.payrollMonth || '',
        'Basic (PKR)': Number(slip.basicOrPiecePay || 0),
        'Overtime (PKR)': Number(slip.overtimePay || 0),
        'Net Payable (PKR)': netPayable,
        Status: slip.paymentStatus || 'Pending',
      };
    });
    return {
      title: 'HR & Payroll Disbursement Report',
      records,
      totals: {
        slips: records.length,
        totalNetPayable: records.reduce((sum, row) => sum + row['Net Payable (PKR)'], 0),
      },
    };
  }
  if (type === 'finance') {
    const records = sourceRecords.finance.map((entry) => {
      const lines = Array.isArray(entry.lines) ? entry.lines : [];
      const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
      return {
        'Voucher #': entry.voucherNumber || '',
        Date: recordDate(entry)?.toISOString().slice(0, 10) || '',
        Type: entry.voucherType || '',
        Narration: entry.narration || '',
        'Debit (PKR)': totalDebit,
        'Credit (PKR)': totalCredit,
        'Posted By': entry.postedBy || '',
      };
    });
    return {
      title: 'General Ledger & Financial Entries Report',
      records,
      totals: {
        entries: records.length,
        totalDebit: records.reduce((sum, row) => sum + row['Debit (PKR)'], 0),
        totalCredit: records.reduce((sum, row) => sum + row['Credit (PKR)'], 0),
      },
    };
  }
  const error = new Error('Unsupported report type');
  error.status = 400;
  throw error;
}

async function getExport(request, user) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || '';
    const format = searchParams.get('format') || '';
    const from = parseDate(searchParams.get('from'), 'Start date');
    const to = parseDate(searchParams.get('to'), 'End date');
    const requestedBranch = searchParams.get('branch') || '';
    if (from && to && from > to) return errorResponse('Start date must not be after end date', 400);
    const validTypes = ['production', 'fabric', 'valuation', 'sales', 'procurement', 'hr', 'finance'];
    if (!validTypes.includes(type)) return errorResponse('Unsupported report type', 400);
    if (!['xlsx', 'pdf'].includes(format)) return errorResponse('Format must be xlsx or pdf', 400);
    if (requestedBranch.length > 100) return errorResponse('Branch filter is too long', 400);
    if (user.role !== 'SuperAdmin' && user.branch && requestedBranch && requestedBranch !== user.branch) {
      return errorResponse('You can only export records for your assigned branch', 403);
    }

    const [production, fabrics, trims, sales, procurement, hr, finance] = await Promise.all([
      type === 'production' ? ProductionOrder.find({}) : [],
      ['fabric', 'valuation'].includes(type) ? Fabric.find({}) : [],
      type === 'valuation' ? TrimItem.find({}) : [],
      type === 'sales' ? SalesOrder.find({}) : [],
      type === 'procurement' ? PurchaseOrder.find({}) : [],
      type === 'hr' ? PayrollSlip.find({}) : [],
      type === 'finance' ? JournalEntry.find({}) : [],
    ]);

    const branch = user.role === 'SuperAdmin' ? requestedBranch : user.branch || requestedBranch;
    const selected = {
      production: production.filter((record) => inRange(record, from, to) && (!branch || recordBranch(record) === branch)),
      fabrics: fabrics.filter((record) => !branch || recordBranch(record) === branch),
      trims: trims.filter((record) => !branch || recordBranch(record) === branch),
      sales: sales.filter((record) => inRange(record, from, to) && (!branch || recordBranch(record) === branch)),
      procurement: procurement.filter((record) => inRange(record, from, to) && (!branch || recordBranch(record) === branch)),
      hr: hr.filter((record) => inRange(record, from, to)),
      finance: finance.filter((record) => inRange(record, from, to)),
    };
    const report = buildReport(type, selected);
    const filterLabel = { from: searchParams.get('from'), to: searchParams.get('to'), branch };

    if (format === 'xlsx') {
      const bytes = await generateXlsxReport(report, filterLabel);
      return new NextResponse(bytes, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="erp-dost-${type}-report.xlsx"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const bytes = await generatePdfReport(report, filterLabel);
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="erp-dost-${type}-report.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (Number(error?.status) < 500) return errorResponse(error.message, error.status);
    console.error('Report export failed:', error);
    if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
      return errorResponse(error.message, error.status);
    }
    return errorResponse('The report export could not be generated', 503);
  }
}

export const GET = withAuthorization(getExport, 'reports', 'read', 'export');
