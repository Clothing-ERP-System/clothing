import { allocateSequence, connectDB } from '@/lib/db.js';
import { DyeRecipe, DyeJobCard } from '@/models/Dyeing.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const recipes = await DyeRecipe.find({}).sort({ shadeName: 1 });
    const storedJobCards = await DyeJobCard.find({}).sort({ createdAt: -1 });
    const recipesById = new Map(recipes.map((recipe) => [recipe._id, recipe]));
    const jobCards = storedJobCards.map((jobCard) => ({
      ...jobCard,
      recipeId: recipesById.get(String(jobCard.recipeId)) || null,
    }));

    return successResponse({
      recipes,
      jobCards,
    });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_RECIPE') {
      const { shadeName, pantoneCode, fabricCompatibility, ingredients, liquorRatio, temperatureCelsius, processTimeMinutes, approvedBy } = body;
      const sequence = await allocateSequence('dye_recipe');
      const recipeCode = `RCP-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const recipe = await DyeRecipe.create({
        recipeCode,
        shadeName,
        pantoneCode: pantoneCode || '',
        fabricCompatibility: fabricCompatibility || '',
        ingredients: ingredients || [],
        liquorRatio: liquorRatio || '',
        temperatureCelsius: Number(temperatureCelsius) || 0,
        processTimeMinutes: Number(processTimeMinutes) || 0,
        approvedBy: approvedBy || '',
      });

      return successResponse({ recipe }, 'Dye recipe created');
    }

    if (action === 'CREATE_JOB_CARD') {
      const { targetShade, recipeId, fabricType, issuedRollNumbers, inputMeters, inputWeightKg, vatMachineNumber, operatorName } = body;
      const sequence = await allocateSequence('dye_job_card');
      const jobCardNumber = `DJC-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const jobCard = await DyeJobCard.create({
        jobCardNumber,
        targetShade,
        recipeId: recipeId || undefined,
        fabricType,
        issuedRollNumbers: issuedRollNumbers || [],
        inputMeters: Number(inputMeters),
        inputWeightKg: Number(inputWeightKg) || 0,
        vatMachineNumber: vatMachineNumber || '',
        status: 'Scheduled',
        chemicalCostTotal: 0,
        laborAndSteamCost: 0,
        totalDyeingCost: 0,
        operatorName: operatorName || '',
      });

      await AuditLog.create({
        userName: operatorName || '',
        action: 'CREATE',
        module: 'Dyeing & Processing',
        recordId: jobCardNumber,
        description: `Created Dye Job Card ${jobCardNumber} for ${targetShade} (${inputMeters}m)`,
      });

      return successResponse({ jobCard }, 'Job Card created');
    }

    if (action === 'UPDATE_JOB_STATUS') {
      const { jobCardId, status, outputMeters, outputWeightKg, labDipApproved } = body;
      const job = await DyeJobCard.findById(jobCardId);
      if (!job) return errorResponse('Job Card not found', 404);

      if (status) job.status = status;
      if (labDipApproved !== undefined) job.labDipApproved = labDipApproved;
      if (outputMeters) {
        job.outputMeters = Number(outputMeters);
        if (job.inputMeters > 0) {
          job.shrinkagePercent = (((job.inputMeters - job.outputMeters) / job.inputMeters) * 100).toFixed(1);
        }
      }
      if (outputWeightKg) job.outputWeightKg = Number(outputWeightKg);
      if (status === 'Completed') job.completionDate = new Date();

      await job.save();

      return successResponse({ job }, 'Job status updated');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
