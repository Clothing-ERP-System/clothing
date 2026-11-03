import User from '@/models/User.js';
import Role from '@/models/Role.js';
import Company from '@/models/Company.js';
import AuditLog from '@/models/AuditLog.js';
import Attachment from '@/models/Attachment.js';
import ApprovalPolicy from '@/models/ApprovalPolicy.js';
import ApprovalRequest from '@/models/ApprovalRequest.js';
import MasterData from '@/models/MasterData.js';
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
import WarehouseTransfer from '@/models/WarehouseTransfer.js';
import { POSTransaction, POSSession } from '@/models/POS.js';
import { Employee, AttendanceRecord, PayrollSlip } from '@/models/HR.js';
import { AccountHead, JournalEntry, ExpenseRecord } from '@/models/Accounting.js';
import { CRMLead, MarketingCampaign } from '@/models/CRM.js';
import { Asset, VehicleTrip } from '@/models/Asset.js';
import { DyeRecipe, DyeJobCard } from '@/models/Dyeing.js';
import { ensureRegisteredTables } from '@/lib/mysql-model.js';

const models = [
  User, Role, Company, AuditLog, Attachment, ApprovalPolicy, ApprovalRequest, MasterData, Fabric, DesignArticle, ProductionOrder,
  QualityInspection, Customer, Supplier, TrimItem, CuttingOrder, SalesOrder,
  PurchaseOrder, WarehouseTransfer, POSTransaction, POSSession, Employee,
  AttendanceRecord, PayrollSlip, AccountHead, JournalEntry, ExpenseRecord,
  CRMLead, MarketingCampaign, Asset, VehicleTrip, DyeRecipe, DyeJobCard,
];

export async function initializeErpSchema() {
  if (!models.length) return;
  await ensureRegisteredTables();
}
