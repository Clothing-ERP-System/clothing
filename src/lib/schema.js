import User from '@/models/User.js';
import Role from '@/models/Role.js';
import Company from '@/models/Company.js';
import AuditLog from '@/models/AuditLog.js';
import Attachment from '@/models/Attachment.js';
import ApprovalPolicy from '@/models/ApprovalPolicy.js';
import ApprovalRequest from '@/models/ApprovalRequest.js';
import MasterData from '@/models/MasterData.js';
import Location from '@/models/Location.js';
import Fabric from '@/models/Fabric.js';
import DesignArticle from '@/models/Design.js';
import ProductionOrder from '@/models/ProductionOrder.js';
import QualityInspection from '@/models/QualityInspection.js';
import Customer from '@/models/Customer.js';
import Supplier from '@/models/Supplier.js';
import TrimItem from '@/models/Trims.js';
import CuttingOrder from '@/models/CuttingOrder.js';
import SalesOrder from '@/models/SalesOrder.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import PurchaseReturn from '@/models/PurchaseReturn.js';
import PurchaseRequisition from '@/models/PurchaseRequisition.js';
import RFQ from '@/models/RFQ.js';
import SupplierQuotation from '@/models/SupplierQuotation.js';
import SupplierInvoice from '@/models/SupplierInvoice.js';
import SalesQuotation from '@/models/SalesQuotation.js';
import WarehouseTransfer from '@/models/WarehouseTransfer.js';
import { POSTransaction, POSSession } from '@/models/POS.js';
import { Employee, AttendanceRecord, PayrollSlip } from '@/models/HR.js';
import { AccountHead, JournalEntry, ExpenseRecord, IncomeRecord } from '@/models/Accounting.js';
import { CRMLead, MarketingCampaign } from '@/models/CRM.js';
import { Asset, VehicleTrip } from '@/models/Asset.js';
import { DyeRecipe, DyeJobCard } from '@/models/Dyeing.js';
import GRNIReconciliation from '@/models/GRNIReconciliation.js';
import ResidualGRNI from '@/models/ResidualGRNI.js';
import LoginRateLimit from '@/models/LoginRateLimit.js';
import { ensureRegisteredTables } from '@/lib/mysql-model.js';

const models = [
  User, Role, Company, AuditLog, Attachment, ApprovalPolicy, ApprovalRequest, MasterData, Location, Fabric, DesignArticle, ProductionOrder,
  QualityInspection, Customer, Supplier, TrimItem, CuttingOrder, SalesOrder, SalesQuotation,
  PurchaseOrder, PurchaseReturn, PurchaseRequisition, RFQ, SupplierQuotation, SupplierInvoice,
  WarehouseTransfer, POSTransaction, POSSession, Employee,
  AttendanceRecord, PayrollSlip, AccountHead, JournalEntry, ExpenseRecord, IncomeRecord,
  CRMLead, MarketingCampaign, Asset, VehicleTrip, DyeRecipe, DyeJobCard,
  GRNIReconciliation, ResidualGRNI, LoginRateLimit,
];

export async function initializeErpSchema() {
  if (!models.length) return;
  await ensureRegisteredTables();
}
