import { allocateSequence, connectDB } from '@/lib/db.js';
import QualityInspection from '@/models/QualityInspection.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const inspections = await QualityInspection.find({}).sort({ createdAt: -1 });
    return successResponse({ inspections });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_INSPECTION') {
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
      } = body;

      const totalChecked = Number(totalSampleChecked);
      if (!Number.isFinite(totalChecked) || totalChecked <= 0) {
        return errorResponse('Enter the number of items inspected', 400);
      }
      const passed = Number(passedQuantity) || 0;
      const rework = Number(reworkQuantity) || 0;
      const rejected = Number(rejectedQuantity) || 0;
      if (passed < 0 || rework < 0 || rejected < 0 || passed + rework + rejected > totalChecked) {
        return errorResponse('Passed, rework and rejected quantities must be non-negative and cannot exceed the inspected quantity', 400);
      }
      if (!stage || !referenceOrder) {
        return errorResponse('Inspection stage and reference order are required', 400);
      }
      const sequence = await allocateSequence('quality_inspection');
      const inspectionNumber = `QC-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      const passRate = Number(((passed / totalChecked) * 100).toFixed(1));

      const inspection = await QualityInspection.create({
        inspectionNumber,
        stage,
        referenceOrder,
        articleCode: articleCode || '',
        inspectorName: inspectorName || '',
        totalSampleChecked: totalChecked,
        passedQuantity: passed,
        reworkQuantity: rework,
        rejectedQuantity: rejected,
        passRatePercentage: passRate,
        defects: defects || [],
        finishingStatus: finishingStatus || {},
        finalVerdict: finalVerdict || '',
        remarks: remarks || '',
      });

      await AuditLog.create({
        userName: inspectorName || '',
        action: 'CREATE',
        module: 'Quality & Finishing',
        recordId: inspectionNumber,
        description: `Logged QC audit ${inspectionNumber} for ${referenceOrder} (${passed}/${totalChecked} Passed - ${passRate}%)`,
      });

      return successResponse({ inspection }, 'Inspection recorded');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
