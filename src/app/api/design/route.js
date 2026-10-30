import { allocateSequence, connectDB } from '@/lib/db.js';
import DesignArticle from '@/models/Design.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const designs = await DesignArticle.find({}).sort({ createdAt: -1 });
    return successResponse({ designs });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
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
      const sequence = await allocateSequence('design_article');
      const designCode = `DSN-${String(sequence).padStart(5, '0')}`;
      const barcode = `DSN${String(sequence).padStart(10, '0')}`;

      // Calculate total factory cost from BOM + labor
      let bomCost = 0;
      (bom || []).forEach(item => {
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
        bom: bom || [],
        sizeGrading: Array.isArray(sizeGrading) ? sizeGrading : [],
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

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
