import { randomUUID } from 'node:crypto';
import ApprovalPolicy from '@/models/ApprovalPolicy.js';
import ApprovalRequest from '@/models/ApprovalRequest.js';
import User from '@/models/User.js';
import Role from '@/models/Role.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import SalesOrder from '@/models/SalesOrder.js';
import WarehouseTransfer from '@/models/WarehouseTransfer.js';
import ProductionOrder from '@/models/ProductionOrder.js';
import QualityInspection from '@/models/QualityInspection.js';
import { ExpenseRecord, JournalEntry } from '@/models/Accounting.js';
import { PayrollSlip } from '@/models/HR.js';
import { DyeJobCard } from '@/models/Dyeing.js';
import Supplier from '@/models/Supplier.js';
import Fabric from '@/models/Fabric.js';
import { BUILT_IN_ROLES, ERP_MODULES } from '@/lib/role-definitions.js';

export const APPROVABLE_DOCUMENTS = {
  procurement: ['purchase_order'],
};

const DOCUMENT_MODELS = {
  'procurement:purchase_order': PurchaseOrder,
  'procurement:supplier_payment': Supplier,
  'sales:sales_order': SalesOrder,
  'sales:sales_return': SalesOrder,
  'warehouse:warehouse_transfer': WarehouseTransfer,
  'warehouse:stock_adjustment': Fabric,
  'production:production_order': ProductionOrder,
  'quality:quality_inspection': QualityInspection,
  'finance:expense': ExpenseRecord,
  'finance:journal_entry': JournalEntry,
  'hr:payroll': PayrollSlip,
  'dyeing:dye_job': DyeJobCard,
};

export function approvalPolicyKey(module, documentType) {
  return `${module}:${documentType}`;
}

export function validApprovalStages(stages) {
  return Array.isArray(stages) && stages.length > 0 && stages.length <= 10 &&
    stages.every((stage) => {
      if (!stage || typeof stage !== 'object' ||
        typeof stage.name !== 'string' || !stage.name.trim() || stage.name.trim().length > 80 ||
        typeof stage.allowSelfApproval !== 'boolean') return false;
      const hasRole = typeof stage.approverRole === 'string' && stage.approverRole.trim();
      const hasUser = typeof stage.approverUserId === 'string' && stage.approverUserId.trim();
      if (Boolean(hasRole) === Boolean(hasUser)) return false;
      for (const field of ['minimumAmount', 'maximumAmount']) {
        if (stage[field] !== undefined &&
          (!Number.isFinite(Number(stage[field])) || Number(stage[field]) < 0)) return false;
      }
      if (stage.minimumAmount !== undefined && stage.maximumAmount !== undefined &&
        Number(stage.minimumAmount) > Number(stage.maximumAmount)) return false;
      return true;
    });
}

export async function validateApprovalStages(stages, module) {
  if (!validApprovalStages(stages)) return 'Define one to ten named approval stages with a role or user approver.';
  for (const stage of stages) {
    if (stage.approverRole) {
      const roleName = stage.approverRole.trim();
      if (roleName === 'SuperAdmin') continue;
      if (BUILT_IN_ROLES.includes(roleName)) {
        return `Approval stage "${stage.name}" uses a built-in role without configurable approval permissions.`;
      }
      const role = await Role.findOne({ name: roleName });
      if (!role) return `Approval stage "${stage.name}" references an unknown role.`;
      if (!Array.isArray(role.permissions) || !role.permissions.includes(`${module}:approve`)) {
        return `Approval stage "${stage.name}" requires a role with ${module}:approve permission.`;
      }
    } else {
      const approver = await User.findById(stage.approverUserId);
      if (!approver || approver.isActive === false) return `Approval stage "${stage.name}" references an inactive or missing user.`;
      if (approver.role === 'SuperAdmin') continue;
      if (BUILT_IN_ROLES.includes(approver.role)) {
        return `Approval stage "${stage.name}" uses a built-in user without configurable approval permissions.`;
      }
      const role = await Role.findOne({ name: approver.role });
      if (!Array.isArray(role?.permissions) || !role.permissions.includes(`${module}:approve`)) {
        return `Approval stage "${stage.name}" requires a user whose role has ${module}:approve permission.`;
      }
    }
  }
  return '';
}

export function approvalConditionsMatch(conditions, { branch, department }) {
  if (!conditions || typeof conditions !== 'object') return true;
  if (Array.isArray(conditions.branches) && conditions.branches.length &&
    !conditions.branches.includes(String(branch || ''))) return false;
  if (Array.isArray(conditions.departments) && conditions.departments.length &&
    !conditions.departments.includes(String(department || ''))) return false;
  return true;
}

export function applicableApprovalStages(stages, amount) {
  const numericAmount = Number(amount || 0);
  return stages.filter((stage) =>
    (stage.minimumAmount === undefined || numericAmount >= Number(stage.minimumAmount)) &&
    (stage.maximumAmount === undefined || numericAmount <= Number(stage.maximumAmount))
  );
}

export async function startApprovalRequest({ module, documentType, documentId, requestId, amount, actor, record }) {
  if (!ERP_MODULES.includes(module) || !APPROVABLE_DOCUMENTS[module]?.includes(documentType)) {
    return { error: 'This module and document type are not supported for approvals' };
  }
  if (!/^[0-9a-f-]{36}$/i.test(String(documentId || ''))) {
    return { error: 'A valid business record ID is required' };
  }
  const policyKey = approvalPolicyKey(module, documentType);
  const policy = await ApprovalPolicy.findOne({ policyKey, isActive: true });
  if (!policy) return { error: 'No active approval policy is configured for this document type' };
  const recordModel = DOCUMENT_MODELS[policyKey];
  if (!recordModel) return { error: 'Approval requests for this document type are not connected to a supported business record' };
  const businessRecord = record || await recordModel.findById(documentId);
  if (!businessRecord) return { error: 'The referenced business record was not found' };
  if (String(businessRecord._id) !== String(documentId)) return { error: 'The approval reference does not match the business record' };
  const recordBranch = String(businessRecord.branch || businessRecord.branchName || businessRecord.outletBranch || '');
  const branch = recordBranch || String(actor.branch || '');
  if (actor.role !== 'SuperAdmin' && actor.branch && branch && String(actor.branch) !== branch) {
    return { error: 'You cannot submit an approval request for another branch' };
  }
  if (!approvalConditionsMatch(policy.conditions, {
    branch,
    department: businessRecord.department || actor.department,
  })) return { error: 'The document does not meet the configured approval conditions' };
  const selectedStages = applicableApprovalStages(policy.stages || [], amount);
  if (!selectedStages.length) return { error: 'No approval stage applies to the submitted amount' };

  const activeReference = `${policyKey}:${documentId}`;
  const existing = await ApprovalRequest.findOne({ activeReference });
  if (existing && existing.status === 'PendingApproval') {
    if (requestId && existing.requestId === requestId) return { request: existing, duplicate: true };
    return { error: 'An approval request is already pending for this record', conflict: true };
  }
  if (!/^[0-9a-f-]{36}$/i.test(String(requestId || ''))) {
    return { error: 'A valid unique request ID is required' };
  }

  const request = await ApprovalRequest.create({
    requestId,
    activeReference,
    referenceKey: activeReference,
    policyId: policy._id,
    policyKey,
    policyVersion: policy.updatedAt || policy.createdAt,
    module,
    documentType,
    documentId,
    documentReference: String(
      businessRecord.poNumber || businessRecord.productionOrderNumber ||
      businessRecord.orderNumber || businessRecord.transferNumber ||
      businessRecord.inspectionNumber || businessRecord.expenseNumber ||
      businessRecord.voucherNumber || businessRecord.name || businessRecord._id
    ),
    branch,
    amount: Number(amount || 0),
    requesterId: String(actor._id),
    requesterName: actor.name || '',
    requesterRole: actor.role,
    stages: selectedStages.map((stage, index) => ({
      name: stage.name.trim(),
      index,
      approverRole: stage.approverRole || '',
      approverUserId: stage.approverUserId || '',
      minimumAmount: stage.minimumAmount === undefined ? null : Number(stage.minimumAmount),
      maximumAmount: stage.maximumAmount === undefined ? null : Number(stage.maximumAmount),
      allowSelfApproval: stage.allowSelfApproval,
    })),
    currentStageIndex: 0,
    currentStage: selectedStages[0].name.trim(),
    status: 'PendingApproval',
    history: [{
      action: 'SUBMITTED',
      userId: String(actor._id),
      userName: actor.name || '',
      role: actor.role,
      timestamp: new Date(),
      reason: '',
    }],
    resubmissions: 0,
    resubmissionAllowed: policy.resubmissionAllowed === true,
    documentReferences: [],
  });

  if (module === 'procurement' && documentType === 'purchase_order') {
    businessRecord.status = 'PendingApproval';
    businessRecord.approvalRequestId = request._id;
    await businessRecord.save();
  }
  return { request, duplicate: false };
}

export function actorCanApproveStage(user, stage) {
  return Boolean(stage && (
    (stage.approverUserId && String(stage.approverUserId) === String(user._id)) ||
    (stage.approverRole && stage.approverRole === user.role)
  ));
}

export function publicApprovalRequest(request) {
  return {
    id: String(request._id),
    requestId: request.requestId,
    module: request.module,
    documentType: request.documentType,
    documentId: request.documentId,
    documentReference: request.documentReference,
    requesterId: String(request.requesterId),
    branch: request.branch,
    amount: request.amount,
    requesterName: request.requesterName,
    requesterRole: request.requesterRole,
    stages: request.stages,
    currentStageIndex: request.currentStageIndex,
    status: request.status,
    history: request.history,
    resubmissions: request.resubmissions,
    resubmissionAllowed: request.resubmissionAllowed,
    documentReferences: request.documentReferences,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

export function documentModel(module, documentType) {
  return DOCUMENT_MODELS[approvalPolicyKey(module, documentType)] || null;
}

export function newApprovalRequestId() {
  return randomUUID();
}
