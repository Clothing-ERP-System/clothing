import { connectDB, runInTransaction } from '@/lib/db.js';
import { errorResponse, forbiddenResponse, fromError, notFoundResponse, successResponse } from '@/lib/api-response.js';
import { getAuthenticatedUser } from '@/lib/authorization.js';
import { canAccessModule } from '@/lib/role-access.js';
import { ERP_MODULES } from '@/lib/role-definitions.js';
import ApprovalPolicy from '@/models/ApprovalPolicy.js';
import ApprovalRequest from '@/models/ApprovalRequest.js';
import AuditLog from '@/models/AuditLog.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import {
  APPROVABLE_DOCUMENTS,
  actorCanApproveStage,
  approvalPolicyKey,
  applicableApprovalStages,
  documentModel,
  publicApprovalRequest,
  startApprovalRequest,
  validateApprovalStages,
} from '@/lib/approval-workflow.js';

function validConditions(value) {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return ['branches', 'departments'].every((field) =>
    value[field] === undefined || (
      Array.isArray(value[field]) &&
      value[field].length <= 100 &&
      value[field].every((item) => typeof item === 'string' && item.trim() && item.length <= 100) &&
      new Set(value[field]).size === value[field].length
    )
  ) && Object.keys(value).every((field) => ['branches', 'departments'].includes(field));
}

function policyPayload(body, existing = {}) {
  const moduleName = body.module ?? existing.module;
  const documentType = body.documentType ?? existing.documentType;
  if (!ERP_MODULES.includes(moduleName) || !APPROVABLE_DOCUMENTS[moduleName]?.includes(documentType)) {
    return { error: 'Select a supported module and document type' };
  }
  const stages = body.stages ?? existing.stages;
  const conditions = body.conditions ?? existing.conditions ?? {};
  const resubmissionAllowed = body.resubmissionAllowed ?? existing.resubmissionAllowed ?? false;
  const isActive = body.isActive === undefined ? existing.isActive !== false : body.isActive;
  if (!Array.isArray(stages) || typeof resubmissionAllowed !== 'boolean' ||
    typeof isActive !== 'boolean' || !validConditions(conditions)) {
    return { error: 'Approval stages, conditions, or resubmission setting are invalid' };
  }
  return {
    value: {
      module: moduleName,
      documentType,
      policyKey: approvalPolicyKey(moduleName, documentType),
      description: String(body.description ?? existing.description ?? '').trim().slice(0, 500),
      stages,
      conditions: {
        branches: conditions.branches || [],
        departments: conditions.departments || [],
      },
      resubmissionAllowed,
      isActive,
    },
  };
}

async function writeAudit(user, action, approval, reason = '') {
  await AuditLog.create({
    userName: user.name || '',
    action,
    module: 'Approvals',
    recordId: approval.documentReference || approval._id,
    description: `${action} ${approval.module}/${approval.documentType} approval for ${approval.documentReference || approval.documentId}${reason ? `: ${reason}` : ''}`,
  });
}

async function getApprovals(request, user) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    if (searchParams.get('view') === 'policies') {
      if (user.role !== 'SuperAdmin') return forbiddenResponse();
      const policies = await ApprovalPolicy.find({}).sort({ module: 1, documentType: 1 });
      return successResponse({ policies });
    }

    const requestedModule = searchParams.get('module') || '';
    if (requestedModule && !ERP_MODULES.includes(requestedModule)) return errorResponse('Unknown module filter', 400);
    if (requestedModule && !await canAccessModule(user, requestedModule, 'view') &&
      !await canAccessModule(user, requestedModule, 'approve')) return forbiddenResponse();

    const allRequests = await ApprovalRequest.find({}).sort({ createdAt: -1 }).limit(500);
    const visible = [];
    for (const approval of allRequests) {
      if (requestedModule && approval.module !== requestedModule) continue;
      if (user.role !== 'SuperAdmin' && approval.branch && user.branch &&
        String(approval.branch) !== String(user.branch)) continue;
      if (user.role !== 'SuperAdmin' &&
        !await canAccessModule(user, approval.module, 'view') &&
        !await canAccessModule(user, approval.module, 'approve')) continue;
      const stage = approval.stages?.[approval.currentStageIndex];
      const assigned = actorCanApproveStage(user, stage);
      if (searchParams.get('view') === 'mine' && String(approval.requesterId) !== String(user._id)) continue;
      if (searchParams.get('view') === 'pending' &&
        (approval.status !== 'PendingApproval' || !assigned)) continue;
      visible.push(publicApprovalRequest(approval));
    }
    return successResponse({ approvals: visible });
  } catch (error) {
    return fromError(error);
  }
}

async function postApprovals(request, actor) {
  try {
    await connectDB();
    const body = await request.json();
    return await runInTransaction(async () => {
      const { action } = body;

      if (['CREATE_POLICY', 'UPDATE_POLICY', 'DELETE_POLICY'].includes(action)) {
        if (actor.role !== 'SuperAdmin') return forbiddenResponse('Only a SuperAdmin can manage approval policies');

        if (action === 'CREATE_POLICY') {
          const parsed = policyPayload(body);
          if (parsed.error) return errorResponse(parsed.error, 400);
          const stageError = await validateApprovalStages(parsed.value.stages, parsed.value.module);
          if (stageError) return errorResponse(stageError, 400);
          const policy = await ApprovalPolicy.create(parsed.value);
          await writeAudit(actor, 'CREATE', policy);
          return successResponse({ policy }, 'Approval policy created', 201);
        }

        const policyId = String(body.policyId || '');
        const policy = await ApprovalPolicy.findByIdForUpdate(policyId);
        if (!policy) return notFoundResponse('Approval policy not found');
        if (action === 'DELETE_POLICY') {
          const requests = await ApprovalRequest.countDocuments({ policyKey: policy.policyKey });
          if (requests) return errorResponse('A policy with approval history cannot be deleted; deactivate it instead', 409);
          await ApprovalPolicy.deleteOne({ _id: policy._id });
          await writeAudit(actor, 'DELETE', policy);
          return successResponse({ policy }, 'Approval policy deleted');
        }
        const parsed = policyPayload(body, policy);
        if (parsed.error) return errorResponse(parsed.error, 400);
        const stageError = await validateApprovalStages(parsed.value.stages, parsed.value.module);
        if (stageError) return errorResponse(stageError, 400);
        if (parsed.value.policyKey !== policy.policyKey) {
          const duplicate = await ApprovalPolicy.findOne({ policyKey: parsed.value.policyKey });
          if (duplicate && duplicate._id !== policy._id) return errorResponse('An approval policy already exists for this document type', 409);
          if (await ApprovalRequest.countDocuments({ policyKey: policy.policyKey, status: 'PendingApproval' })) {
            return errorResponse('Resolve pending requests before changing the policy document type', 409);
          }
        }
        Object.assign(policy, parsed.value);
        await policy.save();
        await writeAudit(actor, 'UPDATE', policy);
        return successResponse({ policy }, 'Approval policy updated');
      }

      if (action === 'SUBMIT') {
        const moduleName = String(body.module || '');
        const documentType = String(body.documentType || '');
        const documentId = String(body.documentId || '');
        if (!ERP_MODULES.includes(moduleName) || !APPROVABLE_DOCUMENTS[moduleName]?.includes(documentType)) {
          return errorResponse('Select a supported module and document type', 400);
        }
        const record = await documentModel(moduleName, documentType)?.findByIdForUpdate(documentId);
        if (!record) return notFoundResponse('The referenced business record was not found or is unsupported');
        const amount = Number(body.amount ?? record.grandTotal ?? record.amount ?? 0);
        if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) {
          return errorResponse('Approval amount must be a non-negative supported number', 400);
        }
        const permission = ['CREATE', 'NEW'].includes(String(body.intent || '').toUpperCase()) ? 'add' : 'edit';
        if (!await canAccessModule(actor, moduleName, permission)) return forbiddenResponse();
        const result = await startApprovalRequest({
          module: moduleName,
          documentType,
          documentId,
          requestId: String(body.requestId || ''),
          amount,
          actor,
          record,
        });
        if (result.error) return errorResponse(result.error, result.conflict ? 409 : 400);
        await writeAudit(actor, result.duplicate ? 'DUPLICATE_SUBMISSION' : 'SUBMIT', result.request);
        return successResponse(
          { approval: publicApprovalRequest(result.request) },
          result.duplicate ? 'Approval request was already submitted' : 'Approval request submitted',
          result.duplicate ? 200 : 201
        );
      }

      if (action === 'APPROVE' || action === 'REJECT') {
        const approval = await ApprovalRequest.findByIdForUpdate(String(body.approvalId || ''));
        if (!approval) return notFoundResponse('Approval request not found');
        if (approval.status !== 'PendingApproval') return errorResponse('This approval request is no longer pending', 409);
        if (!await canAccessModule(actor, approval.module, 'approve')) return forbiddenResponse();
        const stage = approval.stages?.[approval.currentStageIndex];
        if (!stage || !actorCanApproveStage(actor, stage)) {
          return forbiddenResponse('You are not the assigned approver for the current stage');
        }
        if (String(approval.requesterId) === String(actor._id) && !stage.allowSelfApproval) {
          return errorResponse('The requester cannot approve their own document at this stage', 403);
        }
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (action === 'REJECT' && !reason) return errorResponse('A rejection reason is required', 400);
        if (reason.length > 2000) return errorResponse('Approval comments must be 2,000 characters or fewer', 400);
        approval.history = [
          ...(approval.history || []),
          {
            action,
            stage: stage.name,
            stageIndex: approval.currentStageIndex,
            userId: String(actor._id),
            userName: actor.name || '',
            role: actor.role,
            timestamp: new Date(),
            reason,
            documentReferences: Array.isArray(body.documentReferences)
              ? body.documentReferences.filter((value) => typeof value === 'string').slice(0, 10)
              : [],
          },
        ];
        if (action === 'REJECT') {
          approval.status = 'Rejected';
          approval.activeReference = `closed:${approval._id}`;
          approval.completedAt = new Date();
          approval.currentStage = stage.name;
          await updateApprovedDocument(approval, 'Rejected');
        } else if (approval.currentStageIndex + 1 >= approval.stages.length) {
          approval.status = 'Approved';
          approval.activeReference = `closed:${approval._id}`;
          approval.completedAt = new Date();
          approval.currentStage = stage.name;
          await updateApprovedDocument(approval, 'Approved');
        } else {
          approval.currentStageIndex += 1;
          approval.currentStage = approval.stages[approval.currentStageIndex].name;
        }
        await approval.save();
        await writeAudit(actor, action, approval, reason);
        return successResponse({ approval: publicApprovalRequest(approval) }, action === 'APPROVE' ? 'Approval approved' : 'Approval rejected');
      }

      if (action === 'RESUBMIT') {
        const approval = await ApprovalRequest.findByIdForUpdate(String(body.approvalId || ''));
        if (!approval) return notFoundResponse('Approval request not found');
        if (approval.status !== 'Rejected' || !approval.resubmissionAllowed ||
          String(approval.requesterId) !== String(actor._id)) {
          return errorResponse('This rejected request cannot be resubmitted by this user', 409);
        }
        if (!await canAccessModule(actor, approval.module, 'edit')) return forbiddenResponse();
        if (actor.role !== 'SuperAdmin' && approval.branch && actor.branch &&
          String(approval.branch) !== String(actor.branch)) return forbiddenResponse();
        const current = await ApprovalRequest.findOne({ activeReference: approval.referenceKey });
        if (current && current.status === 'PendingApproval') {
          return errorResponse('Another request is already pending for this record', 409);
        }
        const policy = await ApprovalPolicy.findById(approval.policyId);
        if (!policy || policy.isActive === false) return errorResponse('The approval policy is no longer active', 409);
        const freshStages = applicableApprovalStages(policy.stages || [], approval.amount);
        if (!freshStages.length) return errorResponse('No approval stage applies to the submitted amount', 409);
        approval.stages = freshStages.map((stage, index) => ({
          name: stage.name.trim(),
          index,
          approverRole: stage.approverRole || '',
          approverUserId: stage.approverUserId || '',
          minimumAmount: stage.minimumAmount === undefined ? null : Number(stage.minimumAmount),
          maximumAmount: stage.maximumAmount === undefined ? null : Number(stage.maximumAmount),
          allowSelfApproval: stage.allowSelfApproval,
        }));
        approval.currentStageIndex = 0;
        approval.currentStage = approval.stages[0].name;
        approval.status = 'PendingApproval';
        approval.activeReference = approval.referenceKey;
        approval.completedAt = null;
        approval.resubmissions = Number(approval.resubmissions || 0) + 1;
        approval.history = [
          ...(approval.history || []),
          {
            action: 'RESUBMITTED',
            userId: String(actor._id),
            userName: actor.name || '',
            role: actor.role,
            timestamp: new Date(),
            reason: String(body.reason || '').trim().slice(0, 2000),
          },
        ];
        await updateApprovedDocument(approval, 'PendingApproval');
        await approval.save();
        await writeAudit(actor, 'RESUBMIT', approval);
        return successResponse({ approval: publicApprovalRequest(approval) }, 'Approval request resubmitted');
      }

      return errorResponse('Invalid approval action', 400);
    });
  } catch (error) {
    return fromError(error);
  }
}

async function updateApprovedDocument(approval, status) {
  if (approval.module !== 'procurement' || approval.documentType !== 'purchase_order') return;
  const purchaseOrder = await PurchaseOrder.findByIdForUpdate(approval.documentId);
  if (!purchaseOrder) throw Object.assign(new Error('Approved purchase order no longer exists'), { status: 409 });
  purchaseOrder.status = status === 'Rejected'
    ? 'ApprovalRejected'
    : status === 'PendingApproval' ? 'PendingApproval' : 'Approved';
  purchaseOrder.approvalRequestId = approval._id;
  if (status === 'Approved') {
    purchaseOrder.approvedAt = new Date();
    purchaseOrder.approvedBy = approval.history.at(-1)?.userName || '';
  }
  await purchaseOrder.save();
}

export const GET = async (request) => {
  const { user, response } = await getAuthenticatedUser();
  if (response) return response;
  return getApprovals(request, user);
};
export const POST = async (request) => {
  const { user, response } = await getAuthenticatedUser();
  if (response) return response;
  return postApprovals(request, user);
};
