import { allocateSequence, connectDB, runInTransaction } from '@/lib/db.js';
import QualityInspection from '@/models/QualityInspection.js';
import ProductionOrder from '@/models/ProductionOrder.js';
import DesignArticle from '@/models/Design.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, deleteRecord, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { adjustWarehouseStock, recordInventoryMovement } from '@/lib/inventory.js';
import { postBalancedJournalEntry } from '@/lib/accounting.js';
import { JournalEntry } from '@/models/Accounting.js';
import { resolveAndValidateMapping, validateMappingsPresent, getCompanyContext } from '@/lib/accounting-mappings.js';

async function getQuality(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const inspections = applyListQuery(await QualityInspection.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['inspectionNumber', 'referenceOrder', 'articleCode', 'inspectorName', 'finalVerdict'],
      statusField: 'stage',
    }).items;
    const finalQcOrders = await ProductionOrder.find({ status: 'FinalQCReady' });
    return successResponse({ inspections, finalQcOrders });
  } catch (error) {
    return fromError(error);
  }
}

async function postQuality(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_INSPECTION') {
    const requestId = typeof body.submissionRequestId === 'string'
      ? body.submissionRequestId.trim()
      : '';
    if (requestId) {
      const existingInspection = await QualityInspection.findOne({ submissionRequestId: requestId });
      if (existingInspection) {
        return successResponse({ inspection: existingInspection }, 'Inspection was already recorded');
      }
    }
    const {
        stage,
        referenceOrder,
        articleCode,
        inspectorName,
        totalSampleChecked,
        passedQuantity,
        reworkQuantity,
        rejectedQuantity,
        defects,
        finishingStatus,
        finalVerdict,
        remarks,
        acceptedForStockQuantity,
        warehouseLocation,
      } = body;

      const totalChecked = Number(totalSampleChecked);
      if (!Number.isSafeInteger(totalChecked) || totalChecked <= 0) {
        return errorResponse('Enter the number of items inspected', 400);
      }
      const passed = Number(passedQuantity) || 0;
      const rework = Number(reworkQuantity) || 0;
      const rejected = Number(rejectedQuantity) || 0;
      if (![passed, rework, rejected].every(Number.isSafeInteger) ||
        passed < 0 || rework < 0 || rejected < 0 || passed + rework + rejected > totalChecked) {
        return errorResponse('Passed, rework and rejected quantities must be non-negative and cannot exceed the inspected quantity', 400);
      }
      if (!stage || !referenceOrder) {
        return errorResponse('Inspection stage and reference order are required', 400);
      }
      const sequence = await allocateSequence('quality_inspection');
      const inspectionNumber = `QC-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      const passRate = Number(((passed / totalChecked) * 100).toFixed(1));
      let productionOrder = null;
      let design = null;
      let acceptedQuantity = 0;
      let outputQuantity = 0;
      let alreadyStocked = 0;
      let remainingQuantity = 0;
      if (stage === 'FinalGarmentQC') {
        acceptedQuantity = Number(acceptedForStockQuantity ?? 0);
        if (!['Passed', 'Rejected'].includes(finalVerdict) ||
          !Number.isSafeInteger(acceptedQuantity) ||
          finalVerdict === 'Passed' && acceptedQuantity <= 0 ||
          finalVerdict === 'Rejected' && acceptedQuantity !== 0) {
          return errorResponse('Select a final verdict and enter a positive stock quantity only when the order passes', 400);
        }
        const existingOrder = await ProductionOrder.findOne({ productionOrderNumber: referenceOrder });
        productionOrder = existingOrder
          ? await ProductionOrder.findByIdForUpdate(existingOrder._id)
          : null;
        if (!productionOrder || productionOrder.status !== 'FinalQCReady') {
          return errorResponse('Final garment QC requires a production order with finishing completed', 409);
        }

        // Resolve production accounting mappings for finished-goods receipt.
        const qcCompany = await getCompanyContext();
        const qcMappings = qcCompany && qcCompany.accountingMappings ? qcCompany.accountingMappings : {};
        const qcInventoryResult = await resolveAndValidateMapping(qcMappings, 'inventoryAccountCode', 'Asset');
        if (qcInventoryResult.error) return errorResponse(qcInventoryResult.error, 409);
        const qcWipResult = await resolveAndValidateMapping(qcMappings, 'wipAccountCode', 'Asset');
        if (qcWipResult.error) return errorResponse(qcWipResult.error, 409);

        outputQuantity = Number(productionOrder.completedQuantity);
        alreadyStocked = Number(productionOrder.stockedFinishedGoodsQuantity || 0);
        const alreadyRejected = Number(productionOrder.qualityRejectedQuantity || 0);
        const pendingRework = Number(productionOrder.reworkPendingQuantity || 0);
        remainingQuantity = outputQuantity - alreadyStocked - alreadyRejected - pendingRework;
        if (!Number.isSafeInteger(outputQuantity) || !Number.isSafeInteger(alreadyStocked) ||
          alreadyStocked < 0 || alreadyStocked + acceptedQuantity > outputQuantity) {
          return errorResponse('Approved stock quantity exceeds the production output not yet posted to finished inventory', 409);
        }
        if (!Number.isSafeInteger(alreadyRejected) || alreadyRejected < 0 ||
          !Number.isSafeInteger(pendingRework) || pendingRework < 0 ||
          !Number.isSafeInteger(remainingQuantity) || remainingQuantity < 0 ||
          acceptedQuantity + rework + rejected > remainingQuantity ||
          acceptedQuantity + rework + rejected === 0) {
          return errorResponse('Record a positive approved, rework or rejected quantity within the remaining production output', 409);
        }
        if (acceptedQuantity > 0) {
          design = await DesignArticle.findOne({ designCode: productionOrder.designCode });
          design = design ? await DesignArticle.findByIdForUpdate(design._id) : null;
          if (!design) return errorResponse('The production design no longer exists; finished stock was not posted', 409);
          if (!String(warehouseLocation || '').trim()) {
            return errorResponse('Select the warehouse receiving accepted finished goods', 400);
          }
          if (!adjustWarehouseStock(design, 'finishedGoodsStock', warehouseLocation, acceptedQuantity)) {
            return errorResponse('Finished-goods location balances are inconsistent; reconcile stock before posting QC output', 409);
          }

          // Post finished goods receipt journal: Dr Finished Goods / Cr WIP
          // Uses cumulative WIP cost tracking so multiple partial receipts
          // allocate WIP correctly and never exceed the available WIP balance.
          const accumulatedWipCost = Number(productionOrder.accumulatedWipCost || 0);
          const cumulativeAcceptedQty = Number(productionOrder.cumulativeAcceptedQuantity || 0);
          const cumulativeWipTransferred = Number(productionOrder.cumulativeWipTransferred || 0);

          // Historical reconciliation: if cumulative tracking fields are zero but
          // prior finished-goods receipts exist, we cannot reliably reconstruct
          // how much WIP was already transferred. Block automatic WIP transfer
          // and require controlled reconciliation.
          const hasPriorReceipts = alreadyStocked > 0;
          if (hasPriorReceipts && cumulativeAcceptedQty === 0 && cumulativeWipTransferred === 0) {
            return errorResponse(
              'Historical finished-goods receipts detected but cumulative WIP tracking is uninitialized. ' +
              'Controlled reconciliation is required before further WIP transfers can proceed.',
              409,
            );
          }

          const remainingWip = Math.max(0, accumulatedWipCost - cumulativeWipTransferred);
          const remainingEligibleQty = Math.max(0, outputQuantity - cumulativeAcceptedQty - alreadyRejected - pendingRework);

          if (outputQuantity > 0 && remainingWip > 0 && remainingEligibleQty > 0) {
            // Proportional allocation from the remaining WIP pool.
            let wipCostForAccepted = Math.round((acceptedQuantity / remainingEligibleQty) * remainingWip * 100) / 100;
            // Transfer all remaining WIP ONLY when: (a) no rework is pending (reworked pieces
            // will need their own WIP cost when eventually accepted), and (b) this receipt
            // accepts ALL remaining eligible output (nothing left to transfer later).
            const isFinalReceipt = pendingRework === 0 &&
              cumulativeAcceptedQty + acceptedQuantity + alreadyRejected >= outputQuantity;
            if (isFinalReceipt) {
              wipCostForAccepted = remainingWip;
            }
            if (wipCostForAccepted > 0) {
              if (wipCostForAccepted > remainingWip) {
                return errorResponse('WIP cost to credit exceeds remaining WIP balance', 409);
              }
              // Idempotency keyed by the immutable inspection number — two legitimate
              // inspections with equal accepted quantity do not collide.
              const qcSourceKey = `QC_FG_RECEIPT:${inspectionNumber}`;
              const existingQcJournal = await JournalEntry.findOne({ sourceKey: qcSourceKey });
              if (!existingQcJournal) {
                const { entry: qcJournal } = await postBalancedJournalEntry({
                  sourceKey: qcSourceKey,
                  voucherType: 'ProductionCompletion',
                  narration: `Finished goods receipt for ${productionOrder.productionOrderNumber}`,
                  referenceNumber: productionOrder.productionOrderNumber,
                  postedBy: inspectorName || '',
                  lines: [
                    {
                      accountCode: qcInventoryResult.account.code,
                      accountName: qcInventoryResult.account.name,
                      debit: wipCostForAccepted,
                      credit: 0,
                      memo: `Finished goods received for ${productionOrder.productionOrderNumber}`,
                    },
                    {
                      accountCode: qcWipResult.account.code,
                      accountName: qcWipResult.account.name,
                      debit: 0,
                      credit: wipCostForAccepted,
                      memo: `WIP relieved for ${productionOrder.productionOrderNumber}`,
                    },
                  ],
                });
                productionOrder.finishedGoodsJournalId = qcJournal._id;

                // Update cumulative tracking only when a journal was actually posted.
                // On duplicate retry (existingQcJournal), do not double-count.
                productionOrder.cumulativeAcceptedQuantity = cumulativeAcceptedQty + acceptedQuantity;
                productionOrder.cumulativeWipTransferred = Math.min(
                  accumulatedWipCost,
                  cumulativeWipTransferred + wipCostForAccepted,
                );

                // Track finished goods cost per unit on the design for COGS at sale time.
                // Uses the actual WIP cost allocated at QC receipt - not invented values.
                if (design && acceptedQuantity > 0 && wipCostForAccepted > 0) {
                  const costPerUnit = Math.round((wipCostForAccepted / acceptedQuantity) * 100) / 100;
                  const currentCost = Number(design.finishedGoodsCostPerUnit || 0);
                  const currentQty = Number(design.cumulativeFgQuantity || 0);
                  const newQty = currentQty + acceptedQuantity;
                  // Weighted average of actual QC receipt costs per unit
                  design.finishedGoodsCostPerUnit = newQty > 0
                    ? Math.round(((currentCost * currentQty) + (costPerUnit * acceptedQuantity)) / newQty * 100) / 100
                    : costPerUnit;
                  design.cumulativeFgQuantity = newQty;
                  await design.save();
                }
              }
            }
        }
      }

      const inspection = await QualityInspection.create({
        inspectionNumber,
        submissionRequestId: requestId || undefined,
        stage,
        referenceOrder,
        articleCode: productionOrder?.designCode || articleCode || '',
        productionOrderId: productionOrder?._id || '',
        acceptedForStockQuantity: acceptedQuantity,
        inspectorName: inspectorName || '',
        totalSampleChecked: totalChecked,
        passedQuantity: passed,
        reworkQuantity: rework,
        rejectedQuantity: rejected,
        passRatePercentage: passRate,
        defects: defects || [],
        finalVerdict: finalVerdict || '',
        finishingStatus: productionOrder?.finishingChecklist || finishingStatus || {},
        remarks: remarks || '',
      });

      if (productionOrder) {
        productionOrder.stockedFinishedGoodsQuantity =
          Number(productionOrder.stockedFinishedGoodsQuantity || 0) + acceptedQuantity;
        productionOrder.qualityRejectedQuantity =
          Number(productionOrder.qualityRejectedQuantity || 0) + rejected;
        productionOrder.reworkPendingQuantity =
          Number(productionOrder.reworkPendingQuantity || 0) + rework;
        if (rework > 0) {
          productionOrder.status = 'ReworkRequired';
        } else if (
          productionOrder.stockedFinishedGoodsQuantity +
          productionOrder.qualityRejectedQuantity >= Number(productionOrder.completedQuantity)
        ) {
          productionOrder.status = 'Completed';
        }
        if (design) {
          recordInventoryMovement(design, {
            type: 'QC_FINISHED_GOODS',
            quantity: acceptedQuantity,
            unit: 'Pieces',
            referenceType: 'QualityInspection',
            referenceId: inspection._id,
            referenceNumber: inspectionNumber,
            sourceItemId: productionOrder._id,
            warehouseLocation: String(warehouseLocation || '').trim(),
            notes: `Accepted from production order ${productionOrder.productionOrderNumber}`,
          });
          await design.save();
        }
      }
      if (productionOrder) await productionOrder.save();

      await AuditLog.create({
        userName: inspectorName || '',
        action: 'CREATE',
        module: 'Quality & Finishing',
        recordId: inspectionNumber,
        description: `Logged QC audit ${inspectionNumber} for ${referenceOrder} (${passed}/${totalChecked} Passed - ${passRate}%)`,
      });

      return successResponse({ inspection }, 'Inspection recorded');
    }
    }

    if (action === 'UPDATE_INSPECTION') {
      const existingInspection = await QualityInspection.findByIdForUpdate(body.inspectionId);
      if (!existingInspection) return errorResponse('Inspection not found', 404);
      if (existingInspection?.stage === 'FinalGarmentQC') {
        return errorResponse('Final garment inspections cannot be edited because they control production and inventory status', 409);
      }
      if (Number(existingInspection?.acceptedForStockQuantity || 0) > 0) {
        return errorResponse('An inspection that posted finished stock cannot be edited', 409);
      }
      const updates = pickFields(body, [
        'stage', 'referenceOrder', 'articleCode', 'inspectorName', 'totalSampleChecked',
        'passedQuantity', 'reworkQuantity', 'rejectedQuantity', 'defects', 'finishingStatus',
        'finalVerdict', 'remarks',
      ]);
      if (updates.stage !== undefined &&
        !['IncomingFabric', 'InProcessStitching', 'PreShipmentAudit'].includes(updates.stage)) {
        return errorResponse('Select a valid editable inspection stage', 400);
      }
      if (updates.referenceOrder !== undefined) updates.referenceOrder = String(updates.referenceOrder).trim();
      if (updates.inspectorName !== undefined) updates.inspectorName = String(updates.inspectorName).trim();
      if (updates.referenceOrder !== undefined && !updates.referenceOrder ||
        updates.inspectorName !== undefined && !updates.inspectorName) {
        return errorResponse('Reference order and inspector are required', 400);
      }
      if (updates.defects !== undefined && !Array.isArray(updates.defects)) {
        return errorResponse('Defects must be provided as a list', 400);
      }
      if (updates.finishingStatus !== undefined &&
        (!updates.finishingStatus || typeof updates.finishingStatus !== 'object' || Array.isArray(updates.finishingStatus))) {
        return errorResponse('Finishing status must be an object', 400);
      }
      const total = Number(updates.totalSampleChecked ?? existingInspection.totalSampleChecked);
      const passed = Number(updates.passedQuantity ?? existingInspection.passedQuantity);
      const rework = Number(updates.reworkQuantity ?? existingInspection.reworkQuantity);
      const rejected = Number(updates.rejectedQuantity ?? existingInspection.rejectedQuantity);
      if (!Number.isSafeInteger(total) || total <= 0 ||
        ![passed, rework, rejected].every(Number.isSafeInteger) ||
        passed < 0 || rework < 0 || rejected < 0 || passed + rework + rejected > total) {
        return errorResponse('Inspection quantities must be non-negative whole numbers and cannot exceed the inspected sample', 400);
      }
      updates.totalSampleChecked = total;
      updates.passedQuantity = passed;
      updates.reworkQuantity = rework;
      updates.rejectedQuantity = rejected;
      Object.assign(existingInspection, updates, {
        passRatePercentage: Number(((passed / total) * 100).toFixed(1)),
      });
      const inspection = await existingInspection.save();
      return successResponse({ inspection }, 'Inspection updated');
    }

    if (action === 'DELETE_INSPECTION') {
      const existingInspection = await QualityInspection.findById(body.inspectionId);
      if (!existingInspection) return errorResponse('Inspection not found', 404);
      if (existingInspection.stage === 'FinalGarmentQC') {
        return errorResponse('Final garment inspections cannot be deleted because they control production and inventory status', 409);
      }
      if (Number(existingInspection.acceptedForStockQuantity || 0) > 0) {
        return errorResponse('An inspection that posted finished stock cannot be deleted', 409);
      }
      const inspection = await deleteRecord(QualityInspection, body.inspectionId);
      return successResponse({ inspection }, 'Inspection deleted');
    }

    if (action === 'SCRAP_WRITE_OFF') {
      return await runInTransaction(async () => {
        const { productionOrderId, inspectionId, rejectedQuantity, scrapReason } = body;
        if (!productionOrderId) return errorResponse('Production order ID is required', 400);
        if (!inspectionId) return errorResponse('Inspection ID is required', 400);
        const qty = Number(rejectedQuantity);
        if (!Number.isSafeInteger(qty) || qty <= 0) {
          return errorResponse('Rejected quantity must be a positive whole number', 400);
        }
        if (!scrapReason || !String(scrapReason).trim()) {
          return errorResponse('Scrap reason is required', 400);
        }

        const productionOrder = await ProductionOrder.findByIdForUpdate(String(productionOrderId));
        if (!productionOrder) return errorResponse('Production order not found', 404);

        const inspection = await QualityInspection.findByIdForUpdate(String(inspectionId));
        if (!inspection) return errorResponse('Inspection not found', 404);
        if (String(inspection.productionOrderId) !== String(productionOrder._id)) {
          return errorResponse('Inspection does not belong to this production order', 409);
        }
        if (inspection.stage !== 'FinalGarmentQC') {
          return errorResponse('Scrap write-off requires a FinalGarmentQC inspection', 409);
        }

        // Scrap write-off is tracked per inspection. Calculate available rejected
        // quantity for THIS inspection only (not PO-level cumulative).
        const alreadyRejected = Number(inspection.rejectedQuantity || 0);
        // Distinguish between "field absent" (legacy record) and "field is zero".
        // Treating a missing counter as zero would overstate available rejected
        // quantity if historical scrap was written off but never recorded.
        const hasScrapCounter = Object.prototype.hasOwnProperty.call(inspection, 'cumulativeScrapWrittenOff');
        const inspectionCumulativeScrapWrittenOff = hasScrapCounter
          ? Number(inspection.cumulativeScrapWrittenOff || 0)
          : null;
        if (!hasScrapCounter) {
          return errorResponse(
            `Historical scrap counter is missing for inspection ${inspection.inspectionNumber}. ` +
            'Controlled reconciliation required before scrap write-off can proceed.',
            409,
          );
        }
        const availableToScrap = Math.max(0, alreadyRejected - inspectionCumulativeScrapWrittenOff);
        if (qty > availableToScrap) {
          return errorResponse(
            `Rejected quantity ${qty} exceeds available rejected quantity ${availableToScrap} for scrapping on inspection ${inspection.inspectionNumber}`,
            409,
          );
        }

        // Block scrap write-off posting: actual per-unit cost cannot be reliably determined.
        // The system only tracks average material cost per item (trim.unitCost and
        // fabric.averageCostPerMeter), not actual per-batch or per-unit cost.
        // Rework costs, wastage losses, and batch-level cost variations are not tracked.
        // An approved costing policy or reliable cost-allocation records are required
        // before scrap write-offs can be posted.
        return errorResponse(
          'Scrap write-off costing requires an approved costing policy. ' +
          'Current system only tracks average material cost per item, not actual per-unit cost. ' +
          'Configure actual cost tracking or an approved costing policy before posting scrap write-offs.',
          409,
        );
      });
    }

    if (action === 'WIP_RECONCILIATION_REPORT') {
      // Read-only reconciliation report: compares production order WIP tracking
      // fields against actual journal entries and QC records. Does not modify
      // any data. Reports discrepancies requiring controlled reconciliation.
      const productionOrders = await ProductionOrder.find({}).sort({ createdAt: -1 });
      const allInspections = await QualityInspection.find({}).sort({ createdAt: -1 });
      const allJournals = await JournalEntry.find({}).sort({ createdAt: -1 });

      // Index inspections by production order
      const inspectionsByPO = new Map();
      for (const insp of allInspections) {
        if (insp.stage === 'FinalGarmentQC') {
          const key = String(insp.productionOrderId);
          if (!inspectionsByPO.has(key)) inspectionsByPO.set(key, []);
          inspectionsByPO.get(key).push(insp);
        }
      }

      // Index journals by production order (from referenceNumber)
      // Build lookup of all journals by _id for reversal relationship resolution
      const journalById = new Map();
      const consumptionJournalsByPO = new Map();
      const completionJournalsByPO = new Map();
      const scrapJournalsByPO = new Map();
      const reversalJournalsByOriginal = new Map(); // originalId -> reversal journals
      const allIndexedJournalIds = new Set(); // Track which journals were assigned to a PO

      for (const j of allJournals) {
        journalById.set(String(j._id), j);
        const ref = String(j.referenceNumber || '');
        if (j.voucherType === 'ProductionMaterialConsumption') {
          if (!consumptionJournalsByPO.has(ref)) consumptionJournalsByPO.set(ref, []);
          consumptionJournalsByPO.get(ref).push(j);
          if (ref) allIndexedJournalIds.add(String(j._id));
        }
        if (j.voucherType === 'ProductionCompletion') {
          if (!completionJournalsByPO.has(ref)) completionJournalsByPO.set(ref, []);
          completionJournalsByPO.get(ref).push(j);
          if (ref) allIndexedJournalIds.add(String(j._id));
        }
        if (j.voucherType === 'ScrapWriteOff') {
          if (!scrapJournalsByPO.has(ref)) scrapJournalsByPO.set(ref, []);
          scrapJournalsByPO.get(ref).push(j);
          if (ref) allIndexedJournalIds.add(String(j._id));
        }
        // Index reversal journals by their reversalOf target
        if (j.reversalOf) {
          const origId = String(j.reversalOf);
          if (!reversalJournalsByOriginal.has(origId)) reversalJournalsByOriginal.set(origId, []);
          reversalJournalsByOriginal.get(origId).push(j);
        }
      }

      // Detect orphaned reversal references: reversalOf points to a non-existent journal
      const orphanedReversals = [];
      for (const [origId, reversals] of reversalJournalsByOriginal) {
        if (!journalById.has(origId)) {
          orphanedReversals.push({
            originalId: origId,
            reversalCount: reversals.length,
            reversalIds: reversals.map((r) => String(r._id)),
            issue: 'Reversal journal references a non-existent original journal',
          });
        }
      }

      // Detect duplicate reversal records (more than one reversal per original)
      const duplicateReversals = [];
      for (const [origId, reversals] of reversalJournalsByOriginal) {
        if (reversals.length > 1) {
          duplicateReversals.push({
            originalId: origId,
            reversalCount: reversals.length,
            reversalIds: reversals.map((r) => String(r._id)),
            issue: 'Multiple reversal journals found for a single original journal; only one reversal is permitted',
          });
        }
      }

      // Calculate net activity per account code, with reversal awareness.
      // Returns { byAccount, totalGross, totalReversal, totalNet, issues }
      // where byAccount maps accountCode -> { grossOriginal, reversalActivity, netActivity, overReversal }
      function deriveNetActivityByAccount(journals, originalLineFilter) {
        // Reversal lines swap debit/credit relative to originals, so the
        // reversal line filter matches the opposite direction:
        // if original checks debit > 0, reversal checks credit > 0, and vice versa.
        const reversalLineFilter = (line) => {
          if (!line.accountCode) return false;
          const acct = String(line.accountCode);
          const hasDebit = (line.debit || 0) > 0;
          const hasCredit = (line.credit || 0) > 0;
          // Match by account code and non-zero amount in either direction
          return acct && (hasDebit || hasCredit);
        };

        const byAccount = new Map();
        let totalGross = 0;
        let totalReversal = 0;
        const issues = [];

        for (const j of journals) {
          // Skip reversal-type journals themselves (they are offsets, not original activity)
          if (j.voucherType === 'Reversal') continue;

          const jId = String(j._id);
          const reversals = reversalJournalsByOriginal.get(jId) || [];

          // Sum line amounts per account for this original journal
          const accountAmounts = new Map();
          for (const line of j.lines || []) {
            if (!originalLineFilter(line)) continue;
            const acct = String(line.accountCode || '');
            if (!acct) continue;
            const amount = Number(line.debit || 0) - Number(line.credit || 0);
            accountAmounts.set(acct, (accountAmounts.get(acct) || 0) + amount);
          }

          for (const [acct, amount] of accountAmounts) {
            if (!byAccount.has(acct)) {
              byAccount.set(acct, { grossOriginal: 0, reversalActivity: 0, netActivity: 0, overReversal: false });
            }
            const entry = byAccount.get(acct);
            entry.grossOriginal += amount;
            totalGross += amount;
          }

          // Process reversal journals linked to this original
          if (reversals.length > 0) {
            for (const rev of reversals) {
              if (rev.voucherType !== 'Reversal') continue;

              // Cross-PO reference check: reversal's referenceNumber should match original's
              const origRef = String(j.referenceNumber || '');
              const revRef = String(rev.referenceNumber || '');
              if (origRef && revRef && origRef !== revRef) {
                issues.push({
                  originalId: jId,
                  reversalId: String(rev._id),
                  issue: 'Reversal referenceNumber does not match original journal referenceNumber',
                  originalReference: origRef,
                  reversalReference: revRef,
                });
              }

              // Sum reversal amounts per account.
              // Reversal lines use reversalLineFilter (opposite direction from original).
              const revAccountAmounts = new Map();
              for (const line of rev.lines || []) {
                if (!reversalLineFilter(line)) continue;
                const acct = String(line.accountCode || '');
                if (!acct) continue;
                // Amount is the absolute value of the reversal line's net
                const amount = Math.abs(Number(line.debit || 0) - Number(line.credit || 0));
                revAccountAmounts.set(acct, (revAccountAmounts.get(acct) || 0) + amount);
              }

              for (const [acct, revAmount] of revAccountAmounts) {
                if (!byAccount.has(acct)) {
                  byAccount.set(acct, { grossOriginal: 0, reversalActivity: 0, netActivity: 0, overReversal: false });
                }
                const entry = byAccount.get(acct);
                entry.reversalActivity += revAmount;
                totalReversal += revAmount;

                // Over-reversal check: cumulative reversal exceeds original gross for this account
                if (entry.reversalActivity > entry.grossOriginal) {
                  entry.overReversal = true;
                  issues.push({
                    originalId: jId,
                    reversalId: String(rev._id),
                    accountCode: acct,
                    issue: 'Reversal amount exceeds original unreversed amount',
                    originalGross: entry.grossOriginal,
                    reversalActivity: entry.reversalActivity,
                  });
                }
              }
            }
          }
        }

        let totalNet = 0;
        for (const [acct, entry] of byAccount) {
          entry.netActivity = entry.grossOriginal - entry.reversalActivity;
          // Never clamp negative net values to zero
          totalNet += entry.netActivity;
        }

        return { byAccount, totalGross, totalReversal, totalNet, issues };
      }

      // Resolve WIP account code from company mappings for account-specific filtering
      let wipAccountCode = null;
      try {
        const reconCompany = await getCompanyContext();
        const reconMappings = reconCompany && reconCompany.accountingMappings ? reconCompany.accountingMappings : {};
        const wipResult = await resolveAndValidateMapping(reconMappings, 'wipAccountCode', 'Asset');
        if (!wipResult.error) {
          wipAccountCode = wipResult.code;
        }
      } catch {
        // Company context may not be available; fall back to generic debit/credit filtering
      }

      // Build account-specific line filters
      const wipDebitFilter = (line) =>
        line.accountCode && wipAccountCode && String(line.accountCode) === wipAccountCode && (line.debit || 0) > 0;
      const wipCreditFilter = (line) =>
        line.accountCode && wipAccountCode && String(line.accountCode) === wipAccountCode && (line.credit || 0) > 0;

      const reconciliation = [];
      const reconciliationIssues = []; // Global exception list for unmatched/invalid journals

      for (const po of productionOrders) {
        const poNumber = String(po.productionOrderNumber || '');
        const poId = String(po._id);

        // Derive accumulated WIP cost from material consumption journals,
        // with reversal-aware per-account net calculation.
        const consumptionJournals = consumptionJournalsByPO.get(poNumber) || [];
        const wipCostActivity = deriveNetActivityByAccount(
          consumptionJournals,
          wipDebitFilter
        );
        const derivedWipCost = wipCostActivity.totalNet;

        // Derive historical QC accepted quantities
        const poInspections = inspectionsByPO.get(poId) || [];
        let derivedAcceptedQty = 0;
        let derivedRejectedQty = 0;
        for (const insp of poInspections) {
          derivedAcceptedQty += Number(insp.acceptedForStockQuantity || 0);
          derivedRejectedQty += Number(insp.rejectedQuantity || 0);
        }

        // Derive WIP transfers already posted to FG from completion journals,
        // with reversal-aware per-account net calculation. WIP reduction is the CREDIT to WIP.
        const completionJournals = completionJournalsByPO.get(poNumber) || [];
        const wipTransferredActivity = deriveNetActivityByAccount(
          completionJournals,
          wipCreditFilter
        );
        const derivedWipTransferred = wipTransferredActivity.totalNet;

        // Derive scrap write-offs posted to WIP, with reversal-aware per-account net calculation.
        // WIP reduction is the CREDIT to the WIP account line on the scrap journal,
        // NOT the debit to the Scrap/Loss expense account.
        const scrapJournals = scrapJournalsByPO.get(poNumber) || [];
        const scrapActivity = deriveNetActivityByAccount(
          scrapJournals,
          wipCreditFilter
        );
        const derivedScrapWrittenOff = scrapActivity.totalNet;

        const storedWipCost = Number(po.accumulatedWipCost || 0);
        const storedAcceptedQty = Number(po.cumulativeAcceptedQuantity || 0);
        const storedWipTransferred = Number(po.cumulativeWipTransferred || 0);
        const storedScrapWrittenOff = Number(po.cumulativeScrapWrittenOff || 0);

        const discrepancies = [];

        // Check WIP cost mismatch (reversal-aware net)
        if (Math.abs(storedWipCost - derivedWipCost) > 0.01) {
          discrepancies.push({
            field: 'accumulatedWipCost',
            stored: storedWipCost,
            derived: derivedWipCost,
            difference: derivedWipCost - storedWipCost,
            issue: 'Stored WIP cost does not match reversal-aware material consumption journals',
            gross: wipCostActivity.totalGross,
            reversal: wipCostActivity.totalReversal,
            net: wipCostActivity.totalNet,
            perAccount: Object.fromEntries(
              [...wipCostActivity.byAccount.entries()].map(([acct, entry]) => [
                acct,
                { gross: entry.grossOriginal, reversal: entry.reversalActivity, net: entry.netActivity, overReversal: entry.overReversal },
              ])
            ),
          });
        }

        // Check accepted quantity mismatch
        if (storedAcceptedQty !== derivedAcceptedQty) {
          discrepancies.push({
            field: 'cumulativeAcceptedQuantity',
            stored: storedAcceptedQty,
            derived: derivedAcceptedQty,
            difference: derivedAcceptedQty - storedAcceptedQty,
            issue: 'Stored accepted quantity does not match QC inspection records',
          });
        }

        // Check WIP transferred mismatch (reversal-aware net)
        if (Math.abs(storedWipTransferred - derivedWipTransferred) > 0.01) {
          discrepancies.push({
            field: 'cumulativeWipTransferred',
            stored: storedWipTransferred,
            derived: derivedWipTransferred,
            difference: derivedWipTransferred - storedWipTransferred,
            issue: 'Stored WIP transferred does not match reversal-aware ProductionCompletion journals',
            gross: wipTransferredActivity.totalGross,
            reversal: wipTransferredActivity.totalReversal,
            net: wipTransferredActivity.totalNet,
            perAccount: Object.fromEntries(
              [...wipTransferredActivity.byAccount.entries()].map(([acct, entry]) => [
                acct,
                { gross: entry.grossOriginal, reversal: entry.reversalActivity, net: entry.netActivity, overReversal: entry.overReversal },
              ])
            ),
          });
        }

        // Check scrap written off mismatch (reversal-aware net, derived from WIP credit line)
        if (Math.abs(storedScrapWrittenOff - derivedScrapWrittenOff) > 0.01) {
          discrepancies.push({
            field: 'cumulativeScrapWrittenOff',
            stored: storedScrapWrittenOff,
            derived: derivedScrapWrittenOff,
            difference: derivedScrapWrittenOff - storedScrapWrittenOff,
            issue: 'Stored scrap written off does not match reversal-aware ScrapWriteOff journals',
            gross: scrapActivity.totalGross,
            reversal: scrapActivity.totalReversal,
            net: scrapActivity.totalNet,
            perAccount: Object.fromEntries(
              [...scrapActivity.byAccount.entries()].map(([acct, entry]) => [
                acct,
                { gross: entry.grossOriginal, reversal: entry.reversalActivity, net: entry.netActivity, overReversal: entry.overReversal },
              ])
            ),
          });
        }

        // Collect per-account issues (over-reversals, cross-PO mismatches)
        for (const issue of [...wipCostActivity.issues, ...wipTransferredActivity.issues, ...scrapActivity.issues]) {
          discrepancies.push({
            field: 'reversal_integrity',
            stored: null,
            derived: null,
            issue: issue.issue,
            ...issue,
          });
        }

        // Check for uninitialized tracking fields on orders with history
        const hasHistory = derivedAcceptedQty > 0 || derivedWipCost > 0 || derivedWipTransferred > 0 || derivedScrapWrittenOff > 0;
        if (hasHistory && storedWipCost === 0 && storedAcceptedQty === 0 && storedWipTransferred === 0 && storedScrapWrittenOff === 0) {
          discrepancies.push({
            field: 'all',
            stored: 0,
            derived: derivedWipCost,
            issue: 'Historical production order has activity but tracking fields are uninitialized. Controlled reconciliation required.',
          });
        }

        // Flag orphaned reversal references for this PO
        const poOrphanedReversals = orphanedReversals.filter((o) => {
          return o.reversalIds.some((rid) => {
            const rev = journalById.get(rid);
            return rev && String(rev.referenceNumber || '') === poNumber;
          });
        });
        if (poOrphanedReversals.length > 0) {
          discrepancies.push({
            field: 'reversal_integrity',
            stored: null,
            derived: null,
            issue: 'Orphaned reversal references detected - reversal journals point to non-existent originals',
            orphanedReversals: poOrphanedReversals,
          });
        }

        reconciliation.push({
          productionOrderId: poId,
          productionOrderNumber: poNumber,
          designCode: po.designCode || '',
          articleName: po.articleName || '',
          status: po.status || '',
          targetQuantity: Number(po.targetQuantity || 0),
          completedQuantity: Number(po.completedQuantity || 0),
          stored: {
            accumulatedWipCost: storedWipCost,
            cumulativeAcceptedQuantity: storedAcceptedQty,
            cumulativeWipTransferred: storedWipTransferred,
            cumulativeScrapWrittenOff: storedScrapWrittenOff,
          },
          derived: {
            accumulatedWipCost: derivedWipCost,
            cumulativeAcceptedQuantity: derivedAcceptedQty,
            cumulativeWipTransferred: derivedWipTransferred,
            cumulativeScrapWrittenOff: derivedScrapWrittenOff,
          },
          derivedDetail: {
            accumulatedWipCost: {
              gross: wipCostActivity.totalGross,
              reversal: wipCostActivity.totalReversal,
              net: wipCostActivity.totalNet,
            },
            cumulativeWipTransferred: {
              gross: wipTransferredActivity.totalGross,
              reversal: wipTransferredActivity.totalReversal,
              net: wipTransferredActivity.totalNet,
            },
            cumulativeScrapWrittenOff: {
              gross: scrapActivity.totalGross,
              reversal: scrapActivity.totalReversal,
              net: scrapActivity.totalNet,
            },
          },
          discrepancies,
          needsReconciliation: discrepancies.length > 0,
        });
      }

      // --- Unmatched journal detection (global exception list) ---
      const unmatchedJournals = [];
      const duplicateSourceJournals = [];
      const invalidJournals = [];

      const seenSourceKeys = new Set();
      for (const j of allJournals) {
        const jId = String(j._id);
        const ref = String(j.referenceNumber || '');
        const sourceKey = String(j.sourceKey || '');

        // Check for missing referenceNumber
        if (!ref && ['ProductionMaterialConsumption', 'ProductionCompletion', 'ScrapWriteOff'].includes(String(j.voucherType || ''))) {
          unmatchedJournals.push({
            journalId: jId,
            voucherType: j.voucherType,
            referenceNumber: ref,
            sourceKey: sourceKey || null,
            issue: 'WIP-related journal has missing referenceNumber; cannot assign to a production order',
          });
          continue;
        }

        // Check if referenceNumber matches a known production order
        if (ref && ['ProductionMaterialConsumption', 'ProductionCompletion', 'ScrapWriteOff'].includes(String(j.voucherType || ''))) {
          const poExists = productionOrders.some((po) => String(po.productionOrderNumber || '') === ref);
          if (!poExists) {
            unmatchedJournals.push({
              journalId: jId,
              voucherType: j.voucherType,
              referenceNumber: ref,
              sourceKey: sourceKey || null,
              issue: 'Journal referenceNumber does not match any production order',
            });
            continue;
          }
        }

        // Track indexed status
        if (!allIndexedJournalIds.has(jId) && ['ProductionMaterialConsumption', 'ProductionCompletion', 'ScrapWriteOff'].includes(String(j.voucherType || ''))) {
          unmatchedJournals.push({
            journalId: jId,
            voucherType: j.voucherType,
            referenceNumber: ref,
            sourceKey: sourceKey || null,
            issue: 'Journal was not indexed under any production order',
          });
        }

        // Check for duplicate sourceKey
        if (sourceKey) {
          if (seenSourceKeys.has(sourceKey)) {
            duplicateSourceJournals.push({
              journalId: jId,
              voucherType: j.voucherType,
              referenceNumber: ref,
              sourceKey,
              issue: 'Duplicate sourceKey - journal may have been posted more than once',
            });
          }
          seenSourceKeys.add(sourceKey);
        }

        // Validate journal balance
        const lines = Array.isArray(j.lines) ? j.lines : [];
        let totalDebit = 0;
        let totalCredit = 0;
        let hasInvalidLine = false;
        for (const line of lines) {
          const d = Number(line.debit || 0);
          const c = Number(line.credit || 0);
          totalDebit += d;
          totalCredit += c;
          if (!line.accountCode || d < 0 || c < 0 || (d === 0 && c === 0) || (d > 0 && c > 0)) {
            hasInvalidLine = true;
          }
        }
        if (hasInvalidLine || Math.abs(totalDebit - totalCredit) > 0.01) {
          invalidJournals.push({
            journalId: jId,
            voucherType: j.voucherType,
            referenceNumber: ref,
            sourceKey: sourceKey || null,
            totalDebit,
            totalCredit,
            issue: 'Journal has invalid lines or is unbalanced',
          });
        }

        // Check reversal integrity for this journal if it's a reversal
        if (String(j.voucherType || '') === 'Reversal' && j.reversalOf) {
          const orig = journalById.get(String(j.reversalOf));
          if (!orig) {
            // Already captured in orphanedReversals, but add to global list too
            invalidJournals.push({
              journalId: jId,
              voucherType: j.voucherType,
              referenceNumber: ref,
              sourceKey: sourceKey || null,
              issue: 'Reversal references non-existent original journal',
            });
          } else if (String(orig.referenceNumber || '') !== ref) {
            invalidJournals.push({
              journalId: jId,
              voucherType: j.voucherType,
              referenceNumber: ref,
              sourceKey: sourceKey || null,
              issue: 'Reversal referenceNumber does not match original journal referenceNumber',
            });
          }
        }
      }

      reconciliation.sort((a, b) => (b.discrepancies.length - a.discrepancies.length) || (a.productionOrderNumber || '').localeCompare(b.productionOrderNumber || ''));

      const summary = {
        totalOrders: reconciliation.length,
        ordersWithDiscrepancies: reconciliation.filter((r) => r.needsReconciliation).length,
        totalDiscrepancies: reconciliation.reduce((sum, r) => sum + r.discrepancies.length, 0),
        // Global exception summary
        unmatchedJournals: unmatchedJournals.length,
        duplicateSourceJournals: duplicateSourceJournals.length,
        invalidJournals: invalidJournals.length,
        orphanedReversals: orphanedReversals.length,
        duplicateReversals: duplicateReversals.length,
        unmatchedJournalDetails: unmatchedJournals,
        duplicateSourceJournalDetails: duplicateSourceJournals,
        invalidJournalDetails: invalidJournals,
        duplicateReversalDetails: duplicateReversals,
      };

      return successResponse({
        summary,
        reconciliation,
        exceptions: {
          unmatchedJournals,
          duplicateSourceJournals,
          invalidJournals,
          orphanedReversals,
          duplicateReversals,
        },
      }, 'WIP reconciliation report generated');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getQuality, 'quality');
export const POST = withAuthorization(postQuality, 'quality', 'write');
