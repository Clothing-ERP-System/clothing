import { allocateSequence, connectDB } from '@/lib/db.js';
import DesignArticle from '@/models/Design.js';
import Fabric from '@/models/Fabric.js';
import TrimItem from '@/models/Trims.js';
import ProductionOrder from '@/models/ProductionOrder.js';
import CuttingOrder from '@/models/CuttingOrder.js';
import SalesOrder from '@/models/SalesOrder.js';
import { POSTransaction } from '@/models/POS.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, deleteRecord, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';

async function getDesigns(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const designs = applyListQuery(await DesignArticle.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['designCode', 'title', 'season', 'category', 'designerName', 'barcode'],
      statusField: 'sampleStatus',
    }).items;
    const [fabrics, trims] = await Promise.all([Fabric.find({}), TrimItem.find({})]);
    return successResponse({
      designs,
      stockItems: [
        ...fabrics.map(({ _id, fabricCode, name, averageCostPerMeter }) => ({
          id: _id, type: 'Fabric', code: fabricCode, name, unit: 'Meters', unitCost: Number(averageCostPerMeter) || 0,
        })),
        ...trims.map(({ _id, trimCode, name, unit, unitCost }) => ({
          id: _id, type: 'Trim', code: trimCode, name, unit, unitCost: Number(unitCost) || 0,
        })),
      ],
    });
  } catch (error) {
    return fromError(error);
  }
}

async function postDesigns(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_DESIGN') {
      const {
        title,
        season,
        category,
        sampleStatus,
        designerName,
        fabricConsumptionPerPiece,
        cuttingCostPerPiece,
        stitchingCostPerPiece,
        finishingCostPerPiece,
        overheadCostPerPiece,
        suggestedWholesalePrice,
        suggestedRetailPrice,
        techPackNotes,
        bom,
        sizeGrading,
      } = body;

      if (!title || !category || !['Draft', 'Sampling', 'ProductionReady'].includes(sampleStatus)) {
        return errorResponse('Design title, category and a valid sample status are required', 400);
      }
      if (bom !== undefined && !Array.isArray(bom)) return errorResponse('BOM must be a list of referenced stock items', 400);
      const normalizedBom = [];
      for (const line of bom || []) {
        if (!['Fabric', 'Trim'].includes(line?.stockItemType) ||
          typeof line.stockItemId !== 'string' || !line.stockItemId ||
          !Number.isFinite(Number(line.quantityPerGarment)) || Number(line.quantityPerGarment) <= 0) {
          return errorResponse('Every BOM line must reference existing fabric or trim stock and have a positive per-garment quantity', 400);
        }
        const stockItem = line.stockItemType === 'Fabric'
          ? await Fabric.findById(line.stockItemId)
          : await TrimItem.findById(line.stockItemId);
        if (!stockItem) return errorResponse('A BOM stock item no longer exists', 409);
        normalizedBom.push({
          stockItemType: line.stockItemType,
          stockItemId: stockItem._id,
          stockItemCode: line.stockItemType === 'Fabric' ? stockItem.fabricCode : stockItem.trimCode,
          itemName: stockItem.name,
          itemCategory: line.stockItemType,
          quantityPerGarment: Number(line.quantityPerGarment),
          unit: line.stockItemType === 'Fabric' ? 'Meters' : stockItem.unit,
          estimatedUnitCost: line.stockItemType === 'Fabric'
            ? Number(stockItem.averageCostPerMeter) || 0
            : Number(stockItem.unitCost) || 0,
        });
      }
      if (new Set(normalizedBom.map((line) => `${line.stockItemType}:${line.stockItemId}`)).size !== normalizedBom.length) {
        return errorResponse('A stock item can appear only once in the BOM', 400);
      }
      const sequence = await allocateSequence('design_article');
      const designCode = `DSN-${String(sequence).padStart(5, '0')}`;
      const barcode = `DSN${String(sequence).padStart(10, '0')}`;

      // Calculate total factory cost from BOM + labor
      let bomCost = 0;
      normalizedBom.forEach(item => {
        bomCost += (Number(item.quantityPerGarment) || 0) * (Number(item.estimatedUnitCost) || 0);
      });

      const totalLabor = (Number(cuttingCostPerPiece) || 0) + (Number(stitchingCostPerPiece) || 0) + (Number(finishingCostPerPiece) || 0) + (Number(overheadCostPerPiece) || 0);
      const estimatedFactoryCost = Math.round(bomCost + totalLabor);

      const article = await DesignArticle.create({
        designCode,
        title,
        season: season || '',
        category,
        designerName: designerName || '',
        sampleStatus,
        fabricConsumptionPerPiece: Number(fabricConsumptionPerPiece) || 0,
        cuttingCostPerPiece: Number(cuttingCostPerPiece) || 0,
        stitchingCostPerPiece: Number(stitchingCostPerPiece) || 0,
        finishingCostPerPiece: Number(finishingCostPerPiece) || 0,
        overheadCostPerPiece: Number(overheadCostPerPiece) || 0,
        estimatedFactoryCost,
        suggestedWholesalePrice: Number(suggestedWholesalePrice) || 0,
        suggestedRetailPrice: Number(suggestedRetailPrice) || 0,
        barcode,
        techPackNotes: techPackNotes || '',
        bom: normalizedBom,
        sizeGrading: Array.isArray(sizeGrading) ? sizeGrading : [],
        finishedGoodsStock: 0,
        movements: [],
      });

      await AuditLog.create({
        userName: designerName || '',
        action: 'CREATE',
        module: 'Designing & Development',
        recordId: designCode,
        description: `Created new tech pack & BOM for ${title} (${designCode})`,
      });

      return successResponse({ design: article }, 'Design article created');
    }

    if (action === 'UPDATE_DESIGN') {
      const design = await DesignArticle.findByIdForUpdate(body.designId);
      if (!design) return errorResponse('Design article not found', 404);
      const updates = pickFields(body, [
        'title', 'season', 'category', 'sampleStatus', 'designerName', 'fabricConsumptionPerPiece',
        'cuttingCostPerPiece', 'stitchingCostPerPiece', 'finishingCostPerPiece', 'overheadCostPerPiece',
        'suggestedWholesalePrice', 'suggestedRetailPrice', 'techPackNotes', 'bom', 'sizeGrading',
      ]);
      if (updates.title !== undefined) updates.title = String(updates.title).trim();
      if (updates.category !== undefined) updates.category = String(updates.category).trim();
      if (updates.title !== undefined && !updates.title || updates.category !== undefined && !updates.category) {
        return errorResponse('Design title and category cannot be empty', 400);
      }
      if (updates.sampleStatus !== undefined &&
        !['Draft', 'Sampling', 'ProductionReady'].includes(updates.sampleStatus)) {
        return errorResponse('Select a valid design sample status', 400);
      }
      if (updates.bom !== undefined) {
        if (!Array.isArray(updates.bom)) return errorResponse('BOM must be a list of referenced stock items', 400);
        const normalizedBom = [];
        for (const line of updates.bom) {
          if (!['Fabric', 'Trim'].includes(line?.stockItemType) ||
            typeof line.stockItemId !== 'string' || !line.stockItemId ||
            !Number.isFinite(Number(line.quantityPerGarment)) || Number(line.quantityPerGarment) <= 0) {
            return errorResponse('Every BOM line must reference existing fabric or trim stock and have a positive per-garment quantity', 400);
          }
          const stockItem = line.stockItemType === 'Fabric'
            ? await Fabric.findById(line.stockItemId)
            : await TrimItem.findById(line.stockItemId);
          if (!stockItem) return errorResponse('A BOM stock item no longer exists', 409);
          normalizedBom.push({
            stockItemType: line.stockItemType,
            stockItemId: stockItem._id,
            stockItemCode: line.stockItemType === 'Fabric' ? stockItem.fabricCode : stockItem.trimCode,
            itemName: stockItem.name,
            itemCategory: line.stockItemType,
            quantityPerGarment: Number(line.quantityPerGarment),
            unit: line.stockItemType === 'Fabric' ? 'Meters' : stockItem.unit,
            estimatedUnitCost: line.stockItemType === 'Fabric'
              ? Number(stockItem.averageCostPerMeter) || 0
              : Number(stockItem.unitCost) || 0,
          });
        }
        if (new Set(normalizedBom.map((line) => `${line.stockItemType}:${line.stockItemId}`)).size !== normalizedBom.length) {
          return errorResponse('A stock item can appear only once in the BOM', 400);
        }
        updates.bom = normalizedBom;
      }
      if (updates.sizeGrading !== undefined &&
        (!Array.isArray(updates.sizeGrading) ||
          updates.sizeGrading.some((size) => !String(size?.sizeName || '').trim()) ||
          new Set(updates.sizeGrading.map((size) => String(size.sizeName).trim())).size !== updates.sizeGrading.length)) {
        return errorResponse('Size grading must contain unique, non-empty size names', 400);
      }
      for (const field of [
        'fabricConsumptionPerPiece', 'cuttingCostPerPiece', 'stitchingCostPerPiece',
        'finishingCostPerPiece', 'overheadCostPerPiece', 'suggestedWholesalePrice', 'suggestedRetailPrice',
      ]) {
        if (updates[field] === undefined) continue;
        const amount = Number(updates[field]);
        if (!Number.isFinite(amount) || amount < 0) {
          return errorResponse('Design consumption, costs and prices must be non-negative valid amounts', 400);
        }
        updates[field] = amount;
      }
      Object.assign(design, updates);
      const bomCost = (design.bom || []).reduce((total, item) =>
        total + Number(item.quantityPerGarment || 0) * Number(item.estimatedUnitCost || 0), 0);
      const laborCost = Number(design.cuttingCostPerPiece || 0) +
        Number(design.stitchingCostPerPiece || 0) +
        Number(design.finishingCostPerPiece || 0) +
        Number(design.overheadCostPerPiece || 0);
      if (!Number.isFinite(bomCost) || !Number.isFinite(laborCost)) {
        return errorResponse('Design costing data is invalid', 409);
      }
      design.estimatedFactoryCost = Math.round(bomCost + laborCost);
      await design.save();
      return successResponse({ design }, 'Design updated');
    }

    if (action === 'DELETE_DESIGN') {
      const design = await DesignArticle.findById(body.designId);
      if (!design) return errorResponse('Design article not found', 404);
      const relatedRecords = await Promise.all([
        ProductionOrder.find({ designCode: design.designCode }),
        CuttingOrder.find({ designCode: design.designCode }),
        SalesOrder.find({ 'items.articleCode': design.designCode }),
        POSTransaction.find({ 'items.articleCode': design.designCode }),
      ]);
      if (Number(design.finishedGoodsStock || 0) > 0 || (design.movements || []).length ||
        relatedRecords.some((records) => records.length)) {
        return errorResponse('A design with stock or production, cutting, sales or POS history cannot be deleted', 409);
      }
      const deletedDesign = await deleteRecord(DesignArticle, body.designId);
      return successResponse({ design: deletedDesign }, 'Design deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getDesigns, 'design');
export const POST = withAuthorization(postDesigns, 'design', 'write');
