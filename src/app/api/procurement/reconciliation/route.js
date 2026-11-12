import { connectDB, runInTransaction } from '@/lib/db.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import SupplierInvoice from '@/models/SupplierInvoice.js';
import Supplier from '@/models/Supplier.js';
import { AccountHead, JournalEntry } from '@/models/Accounting.js';
import ResidualGRNI from '@/models/ResidualGRNI.js';
import GRNIReconciliation from '@/models/GRNIReconciliation.js';
import AuditLog from '@/models/AuditLog.js';
import { postBalancedJournalEntry } from '@/lib/accounting.js';
import { resolveAndValidateMapping, validateMappingsPresent, getCompanyContext } from '@/lib/accounting-mappings.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { withAuthorization } from '@/lib/authorization.js';
import { randomUUID } from 'node:crypto';
import { applyListQuery, parseListQuery } from '@/lib/query.js';

// Maps adjustment type to the accounting-mappings key for the permitted counter account.
function adjustmentTypeToMappingKey(adjustmentType) {
  const mapping = {
    price_variance: 'cogsAccountCode',
    inventory_correction: 'inventoryAccountCode',
    expense_write_off: 'expenseAccountCode',
  };
  return mapping[adjustmentType] || null;
}

async function getReconciliation(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);

    const [purchaseOrders, supplierInvoices, suppliers] = await Promise.all([
      PurchaseOrder.find({}).lean(),
      SupplierInvoice.find({}).lean(),
      Supplier.find({}).lean(),
    ]);

    const supplierMap = new Map();
    for (const s of suppliers) {
      supplierMap.set(s._id, s);
    }

    // Build GRNI reconciliation view: GRN -> supplier -> remaining balance
    const reconciliation = [];
    for (const po of purchaseOrders) {
      const grns = Array.isArray(po.grns) ? po.grns : [];
      for (const grn of grns) {
        if (!grn.grnNumber) continue;

        const grnAcceptedValue = Number(grn.acceptedValue || grn.totalReceivedValue || 0);

        // Find invoices against this GRN
        const grnInvoices = supplierInvoices.filter((inv) => inv.grnNumber === grn.grnNumber);

        // Group by supplier
        const bySupplier = new Map();
        for (const inv of grnInvoices) {
          const sid = inv.supplierId || '';
          if (!bySupplier.has(sid)) {
            bySupplier.set(sid, {
              supplierId: sid,
              supplierName: inv.supplierName || '',
              invoicedValue: 0,
              grniClearedFromInvoice: 0,
              invoices: [],
            });
          }
          const sInfo = bySupplier.get(sid);
          sInfo.invoicedValue += Number(inv.subtotal || 0);
          sInfo.invoices.push(inv.invoiceNumber);

          // Calculate GRNI cleared from prior journal entries
          const priorJournal = await JournalEntry.findOne({
            sourceKey: `SUPPLIER_INVOICE:${sid}:${inv.invoiceNumber}`,
          });
          if (priorJournal && priorJournal.lines) {
            const company = await getCompanyContext();
            const mappings = company && company.accountingMappings ? company.accountingMappings : {};
            const resolvedGrniCode = mappings.grniAccountCode || '2030';
            for (const line of priorJournal.lines) {
              if (line.accountCode === resolvedGrniCode) {
                sInfo.grniClearedFromInvoice += Number(line.debit || 0);
              }
            }
          }
        }

        // Add adjustments already made
        const adjustments = await ResidualGRNI.find({ grnNumber: grn.grnNumber }).lean();
        for (const adj of adjustments) {
          const sid = adj.supplierId;
          if (!bySupplier.has(sid)) {
            bySupplier.set(sid, {
              supplierId: sid,
              supplierName: adj.supplierName || '',
              invoicedValue: 0,
              grniClearedFromInvoice: 0,
              invoices: [],
            });
          }
          const sInfo = bySupplier.get(sid);
          if (adj.status === 'Approved' || adj.status === 'Reconciled') {
            sInfo.grniClearedFromInvoice += Number(adj.adjustmentAmount || 0);
          }
        }

        for (const [supplierId, sInfo] of bySupplier) {
          const remainingGRNI = Math.max(0, grnAcceptedValue - sInfo.grniClearedFromInvoice);
          const supplier = supplierMap.get(supplierId);
          reconciliation.push({
            grnNumber: grn.grnNumber,
            poNumber: po.poNumber,
            supplierId,
            supplierName: sInfo.supplierName || (supplier ? supplier.name : ''),
            grnAcceptedValue,
            invoicedValue: sInfo.invoicedValue,
            grniCleared: sInfo.grniClearedFromInvoice,
            remainingGRNI,
            invoiceCount: sInfo.invoices.length,
            adjustmentCount: adjustments.filter((a) => a.supplierId === supplierId).length,
            grnDate: grn.inspectionDate || grn.receivedDate || '',
            isFullyCleared: remainingGRNI === 0,
          });
        }
      }
    }

    reconciliation.sort((a, b) => b.remainingGRNI - a.remainingGRNI);

    const filtered = applyListQuery(reconciliation, query, {
      searchFields: ['grnNumber', 'poNumber', 'supplierName', 'supplierId'],
    });

    return successResponse({
      reconciliation: filtered.items,
      total: filtered.total || filtered.items.length,
      totalOutstanding: reconciliation.reduce((sum, r) => sum + r.remainingGRNI, 0),
    });
  } catch (error) {
    return fromError(error);
  }
}

async function postReconciliation(request, actor) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_RECONCILIATION_PROPOSAL') {
      return await runInTransaction(async () => {
        // Lock PO row first to establish fresh read snapshot
        const matchedPo = await PurchaseOrder.findByGrnNumberForUpdate(grnNumber);
        if (!matchedPo) {
          return errorResponse('GRN not found', 404);
        }
        const grnAcceptedValue = Number(matchedPo.acceptedValue || matchedPo.totalReceivedValue || 0);

        // Calculate already-cleared GRNI
        let grniAlreadyCleared = 0;
        const priorInvoices = await SupplierInvoice.find({ grnNumber, supplierId }).lean();
        for (const priorInvoice of priorInvoices) {
          const priorJournal = await JournalEntry.findOne({
            sourceKey: `SUPPLIER_INVOICE:${supplierId}:${priorInvoice.invoiceNumber}`,
          });
          if (priorJournal && priorJournal.lines) {
            const company = await getCompanyContext();
            const mappings = company && company.accountingMappings ? company.accountingMappings : {};
            const resolvedGrniCode = mappings.grniAccountCode || '2030';
            for (const line of priorJournal.lines) {
              if (line.accountCode === resolvedGrniCode) {
                grniAlreadyCleared += Number(line.debit || 0);
              }
            }
          }
        }

        const priorAdjustments = await ResidualGRNI.find({ grnNumber, supplierId }).lean();
        for (const adj of priorAdjustments) {
          if (adj.status === 'Approved' || adj.status === 'Reconciled') {
            grniAlreadyCleared += Number(adj.adjustmentAmount || 0);
          }
        }

        const remainingGRNI = Math.max(0, grnAcceptedValue - grniAlreadyCleared);
        if (amount > remainingGRNI) {
          return errorResponse(
            `Proposed amount exceeds remaining GRNI ${remainingGRNI}`,
            409,
          );
        }

        // Resolve accounts
        const company = await getCompanyContext();
        const mappings = company && company.accountingMappings ? company.accountingMappings : {};
        const resolvedGrniCode = mappings.grniAccountCode;
        if (!resolvedGrniCode) {
          return errorResponse('GRNI account mapping is not configured', 409);
        }
        const grniAccount = await AccountHead.findOne({ code: resolvedGrniCode });
        if (!grniAccount || grniAccount.type !== 'Liability') {
          return errorResponse(`GRNI account (${resolvedGrniCode}) must be a liability account`, 409);
        }

        const counterAccount = await AccountHead.findOne({ code: counterAccountCode.trim() });
        if (!counterAccount) {
          return errorResponse(`Counter account ${counterAccountCode} does not exist`, 409);
        }
        // Validate counter account against purpose-based mapping
        const counterAccountMappingKey = adjustmentTypeToMappingKey(adjustmentType);
        if (!counterAccountMappingKey) {
          return errorResponse(`Invalid adjustment type: ${adjustmentType}`, 400);
        }
        const resolvedCounterAccountCode = mappings[counterAccountMappingKey];
        if (!resolvedCounterAccountCode) {
          return errorResponse(`No account mapped for adjustment type '${adjustmentType}' (mapping key '${counterAccountMappingKey}')`, 409);
        }
        if (counterAccount.code.trim() !== resolvedCounterAccountCode.trim()) {
          return errorResponse(`Counter account ${counterAccountCode.trim()} does not match required account ${resolvedCounterAccountCode.trim()} for adjustment type '${adjustmentType}'`, 409);
        }

        // Idempotency
        const proposalSourceKey = `GRNI_RECONCILIATION:${supplierId}:${grnNumber}:${amount}:${reason}`;
        const existing = await GRNIReconciliation.findOne({ grnNumber, supplierId, referenceNumber: proposalSourceKey }).lean();
        if (existing) {
          return errorResponse('A reconciliation proposal for this GRN and amount already exists', 409);
        }

        // Create proposal (Pending status - requires approval)
        const proposal = await GRNIReconciliation.create({
          grnNumber,
          supplierId,
          supplierName: matchedPo.supplierName || '',
          poNumber: matchedPo.poNumber,
          proposedAmount: amount,
          counterAccountCode: counterAccount.code,
          counterAccountName: counterAccount.name,
          reason,
          approvalReference,
          status: 'Pending',
          proposedBy: actor?.name || '',
          proposedAt: new Date(),
          referenceNumber: proposalSourceKey,
        });

        await AuditLog.create({
          userName: actor?.name || '',
          action: 'CREATE',
          module: 'Procurement',
          recordId: proposal._id.toString(),
          description: `Created GRNI reconciliation proposal for ${grnNumber}: Rs. ${amount.toLocaleString()}`,
        });

        return successResponse({ proposal }, 'Reconciliation proposal created (pending approval)');
      });
    }

    if (action === 'APPROVE_RECONCILIATION') {
      return await runInTransaction(async () => {
        const { proposalId } = body;
        if (!proposalId) return errorResponse('Proposal ID is required', 400);

        const proposal = await GRNIReconciliation.findByIdForUpdate(proposalId);
        if (!proposal) return errorResponse('Reconciliation proposal not found', 404);
        if (proposal.status !== 'Pending') {
          return errorResponse(`Proposal is already ${proposal.status}`, 409);
        }

        // Separation of duties: requester cannot approve their own proposal
        if (actor?.name && proposal.proposedBy === actor.name) {
          return errorResponse('You cannot approve your own proposal. Separation of duties required.', 403);
        }

        // Role-based authorization: only Accountant role (or SuperAdmin) can approve
        if (actor?.role !== 'SuperAdmin' && actor?.role !== 'Accountant') {
          return errorResponse('Only an Accountant or SuperAdmin can approve reconciliation proposals', 403);
        }

        // Lock PO row FIRST to establish fresh read snapshot before any account lookups
        const matchedPo = await PurchaseOrder.findByGrnNumberForUpdate(proposal.grnNumber);
        if (!matchedPo) {
          return errorResponse('GRN not found', 404);
        }
        const grnAcceptedValue = Number(matchedPo.acceptedValue || matchedPo.totalReceivedValue || 0);

        // Verify supplier ownership: the locked PO's supplier must match the proposal's supplier.
        const poSupplierId = String(matchedPo.supplierId || '').trim();
        const proposalSupplierId = String(proposal.supplierId || '').trim();
        if (poSupplierId !== proposalSupplierId) {
          return errorResponse('GRN supplier does not match the purchase order supplier', 409);
        }

        // Verify the locked PO contains this GRN and belongs to the expected supplier
        const grnMatch = Array.isArray(matchedPo.grns) ? matchedPo.grns.find((g) => g.grnNumber === proposal.grnNumber) : null;
        if (!grnMatch) {
          return errorResponse(`GRN ${proposal.grnNumber} not found on PO ${matchedPo.poNumber}`, 404);
        }

        // Validate accounts after acquiring PO lock (snapshot now includes concurrent commits)
        const company = await getCompanyContext();
        const mappings = company && company.accountingMappings ? company.accountingMappings : {};
        const resolvedGrniCode = mappings.grniAccountCode;
        if (!resolvedGrniCode) {
          return errorResponse('GRNI account mapping is not configured', 409);
        }
        const grniLiabilityAccount = await AccountHead.findOne({ code: resolvedGrniCode });
        if (!grniLiabilityAccount || grniLiabilityAccount.type !== 'Liability') {
          return errorResponse('GRNI clearing account is not configured correctly', 409);
        }

        const counterAccount = await AccountHead.findOne({ code: proposal.counterAccountCode.trim() });
        if (!counterAccount) {
          return errorResponse(`Counter account ${proposal.counterAccountCode} does not exist`, 409);
        }
        // Validate counter account against purpose-based mapping
        const counterAccountMappingKey = adjustmentTypeToMappingKey(proposal.adjustmentType);
        if (!counterAccountMappingKey) {
          return errorResponse(`Invalid adjustment type: ${proposal.adjustmentType}`, 400);
        }
        const resolvedCounterAccountCode = mappings[counterAccountMappingKey];
        if (!resolvedCounterAccountCode) {
          return errorResponse(`No account mapped for adjustment type '${proposal.adjustmentType}' (mapping key '${counterAccountMappingKey}')`, 409);
        }
        if (counterAccount.code.trim() !== resolvedCounterAccountCode.trim()) {
          return errorResponse(`Counter account ${proposal.counterAccountCode.trim()} does not match required account ${resolvedCounterAccountCode.trim()} for adjustment type '${proposal.adjustmentType}'`, 409);
        }

        // Re-verify remaining GRNI with locked PO — read prior cleared amounts AFTER acquiring PO lock
        let grniAlreadyCleared = 0;
        const priorInvoices = await SupplierInvoice.find({
          grnNumber: proposal.grnNumber,
          supplierId: proposal.supplierId,
        }).lean();
        for (const priorInvoice of priorInvoices) {
          const priorJournal = await JournalEntry.findOne({
            sourceKey: `SUPPLIER_INVOICE:${proposal.supplierId}:${priorInvoice.invoiceNumber}`,
          });
          if (priorJournal && priorJournal.lines) {
            for (const line of priorJournal.lines) {
              if (line.accountCode === resolvedGrniCode) {
                grniAlreadyCleared += Number(line.debit || 0);
              }
            }
          }
        }
        const priorAdjustments = await ResidualGRNI.find({
          grnNumber: proposal.grnNumber,
          supplierId: proposal.supplierId,
        }).lean();
        for (const adj of priorAdjustments) {
          if (adj._id.toString() !== proposal._id.toString() && (adj.status === 'Approved' || adj.status === 'Reconciled')) {
            grniAlreadyCleared += Number(adj.adjustmentAmount || 0);
          }
        }

        const remainingGRNI = Math.max(0, grnAcceptedValue - grniAlreadyCleared);

        if (proposal.proposedAmount > remainingGRNI) {
          return errorResponse(
            `Proposed amount exceeds remaining GRNI ${remainingGRNI}`,
            409,
          );
        }

        // Lock accounts in consistent order to prevent deadlocks
        const lockOrder = [resolvedGrniCode, proposal.counterAccountCode.trim()].sort();
        const lockedAccounts = new Map();
        for (const code of lockOrder) {
          const acc = code === resolvedGrniCode ? grniLiabilityAccount : counterAccount;
          const locked = await AccountHead.findByIdForUpdate(acc._id);
          if (!locked) {
            return errorResponse(`Account ${code} could not be locked`, 409);
          }
          lockedAccounts.set(code, locked);
        }

        const lockedGrni = lockedAccounts.get(resolvedGrniCode);
        const lockedCounter = lockedAccounts.get(proposal.counterAccountCode.trim());

        // Idempotency: check journal not already posted
        const adjustmentSourceKey = `GRNI_RECONCILIATION:${proposal.supplierId}:${proposal.grnNumber}:${proposal.proposedAmount}:${proposal.reason}`;
        const existingJournal = await JournalEntry.findOne({ sourceKey: adjustmentSourceKey });
        if (existingJournal) {
          return errorResponse('A journal entry for this reconciliation already exists', 409);
        }

        // Post balanced journal: Debit GRNI (reduce liability), Credit counter account
        const { entry: journalEntry } = await postBalancedJournalEntry({
          sourceKey: adjustmentSourceKey,
          voucherType: 'GRNIReconciliation',
          narration: `GRNI reconciliation for ${proposal.grnNumber} - ${proposal.reason}`,
          referenceNumber: proposal.grnNumber,
          postedBy: actor?.name || '',
          lines: [
            {
              accountCode: resolvedGrniCode,
              accountName: grniLiabilityAccount.name,
              debit: proposal.proposedAmount,
              credit: 0,
              memo: `Reconcile residual GRNI for ${proposal.grnNumber}`,
            },
            {
              accountCode: proposal.counterAccountCode,
              accountName: proposal.counterAccountName,
              debit: 0,
              credit: proposal.proposedAmount,
              memo: `GRNI reconciliation - ${proposal.reason}`,
            },
          ],
        });

        // Also create a ResidualGRNI record
        await ResidualGRNI.create({
          grnNumber: proposal.grnNumber,
          supplierId: proposal.supplierId,
          supplierName: proposal.supplierName,
          poNumber: proposal.poNumber,
          adjustmentAmount: proposal.proposedAmount,
          counterAccountCode: proposal.counterAccountCode,
          counterAccountName: proposal.counterAccountName,
          reason: proposal.reason,
          approvalReference: proposal.approvalReference,
          status: 'Reconciled',
          approvedBy: actor?.name || '',
          approvedAt: new Date(),
          journalEntryId: journalEntry._id,
          sourceKey: adjustmentSourceKey,
        });

        // Update proposal status
        proposal.status = 'Approved';
        proposal.approvedBy = actor?.name || '';
        proposal.approvedAt = new Date();
        proposal.journalEntryId = journalEntry._id;
        await proposal.save();

        await AuditLog.create({
          userName: actor?.name || '',
          action: 'APPROVE',
          module: 'Procurement',
          recordId: proposal._id.toString(),
          description: `Approved GRNI reconciliation for ${proposal.grnNumber}: Rs. ${proposal.proposedAmount.toLocaleString()}`,
        });

        return successResponse({
          proposal,
          journalEntry,
        }, 'Reconciliation approved and posted');
      });
    }

    if (action === 'REVIEW_RECONCILIATION') {
      const { proposalId, status, reviewerNotes } = body;
      if (!proposalId) return errorResponse('Proposal ID is required', 400);
      if (!['Reviewed', 'Rejected'].includes(status)) {
        return errorResponse('Status must be Reviewed or Rejected', 400);
      }

      const proposal = await GRNIReconciliation.findByIdForUpdate(proposalId);
      if (!proposal) return errorResponse('Reconciliation proposal not found', 404);
      if (proposal.status !== 'Pending') {
        return errorResponse(`Proposal is already ${proposal.status}`, 409);
      }

      proposal.status = status;
      proposal.reviewedBy = actor?.name || '';
      proposal.reviewedAt = new Date();
      proposal.reviewerNotes = reviewerNotes || '';
      await proposal.save();

      await AuditLog.create({
        userName: actor?.name || '',
        action: 'UPDATE',
        module: 'Procurement',
        recordId: proposal._id.toString(),
        description: `Reviewed GRNI reconciliation proposal ${proposal.grnNumber} as ${status}`,
      });

      return successResponse({ proposal }, `Reconciliation proposal ${status.toLowerCase()}`);
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getReconciliation, 'procurement');
export const POST = withAuthorization(postReconciliation, 'procurement', 'write');
