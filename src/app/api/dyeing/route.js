import { allocateSequence, connectDB } from '@/lib/db.js';
import { DyeRecipe, DyeJobCard } from '@/models/Dyeing.js';
import Fabric from '@/models/Fabric.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { recordInventoryMovement, sumAvailableFabricMeters } from '@/lib/inventory.js';

async function getDyeing(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const recipes = applyListQuery(await DyeRecipe.find({}).sort({ shadeName: 1 }), query, {
      searchFields: ['recipeCode', 'shadeName', 'pantoneCode', 'fabricCompatibility'],
    }).items;
    const storedJobCards = applyListQuery(await DyeJobCard.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['jobCardNumber', 'targetShade', 'fabricType', 'vatMachineNumber', 'operatorName'],
    }).items;
    const recipesById = new Map(recipes.map((recipe) => [recipe._id, recipe]));
    const jobCards = storedJobCards.map((jobCard) => ({
      ...jobCard,
      recipeId: recipesById.get(String(jobCard.recipeId)) || null,
    }));
    const fabrics = await Fabric.find({});
    const fabricItems = fabrics.map(({ _id, fabricCode, name }) => ({ id: _id, code: fabricCode, name }));
    const availableRolls = fabrics.flatMap((fabric) =>
      (fabric.rolls || [])
        .filter((roll) => !['Voided', 'InTransit'].includes(roll.status) && Number(roll.remainingMeters) > 0)
        .map((roll) => ({
          rollNumber: roll.rollNumber,
          fabricCode: fabric.fabricCode,
          fabricName: fabric.name,
          remainingMeters: Number(roll.remainingMeters),
        }))
    );

    return successResponse({
      recipes,
      jobCards,
      availableRolls,
      fabricItems,
    });
  } catch (error) {
    return fromError(error);
  }
}

async function postDyeing(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_RECIPE') {
      const { shadeName, pantoneCode, fabricCompatibility, ingredients, liquorRatio, temperatureCelsius, processTimeMinutes, approvedBy } = body;
      const normalizedShade = String(shadeName || '').trim();
      const temperature = Number(temperatureCelsius ?? 0);
      const processTime = Number(processTimeMinutes ?? 0);
      if (!normalizedShade) return errorResponse('Shade name is required', 400);
      if (!Array.isArray(ingredients) || ingredients.length === 0 ||
        ingredients.some((ingredient) =>
          !String(ingredient?.chemicalName || '').trim() ||
          !Number.isFinite(Number(ingredient?.ratioGramsPerKg)) ||
          Number(ingredient.ratioGramsPerKg) <= 0
        )) {
        return errorResponse('Add at least one dye ingredient with a positive grams-per-kilogram ratio', 400);
      }
      if (!Number.isFinite(temperature) || temperature < 0 ||
        !Number.isFinite(processTime) || processTime < 0) {
        return errorResponse('Temperature and process time must be non-negative valid numbers', 400);
      }
      const sequence = await allocateSequence('dye_recipe');
      const recipeCode = `RCP-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const recipe = await DyeRecipe.create({
        recipeCode,
        shadeName: normalizedShade,
        pantoneCode: pantoneCode || '',
        fabricCompatibility: fabricCompatibility || '',
        ingredients: ingredients.map((ingredient) => ({
          chemicalName: String(ingredient.chemicalName).trim(),
          ratioGramsPerKg: Number(ingredient.ratioGramsPerKg),
        })),
        liquorRatio: liquorRatio || '',
        temperatureCelsius: temperature,
        processTimeMinutes: processTime,
        approvedBy: approvedBy || '',
      });

      return successResponse({ recipe }, 'Dye recipe created');
    }

    if (action === 'CREATE_JOB_CARD') {
      const { targetShade, recipeId, fabricType, fabricAllocations, inputMeters, inputWeightKg, vatMachineNumber, operatorName } = body;
      const inputLength = Number(inputMeters);
      if (!targetShade || !Number.isFinite(inputLength) || inputLength <= 0 ||
        !Array.isArray(fabricAllocations) || !fabricAllocations.length) {
        return errorResponse('Target shade, a positive input length and explicit fabric roll allocations are required', 400);
      }
      const normalizedAllocations = fabricAllocations.map((allocation) => ({
        rollNumber: String(allocation?.rollNumber || '').trim(),
        meters: Number(allocation?.meters),
      }));
      if (normalizedAllocations.some((allocation) => !allocation.rollNumber ||
        !Number.isFinite(allocation.meters) || allocation.meters <= 0) ||
        new Set(normalizedAllocations.map((allocation) => allocation.rollNumber)).size !== normalizedAllocations.length ||
        Math.abs(normalizedAllocations.reduce((sum, allocation) => sum + allocation.meters, 0) - inputLength) > 0.000001) {
        return errorResponse('Each roll needs a positive quantity and allocated lengths must equal the job input length', 400);
      }
      const weight = Number(inputWeightKg || 0);
      if (!Number.isFinite(weight) || weight < 0) {
        return errorResponse('Input weight must be a non-negative number', 400);
      }
      if (recipeId && !await DyeRecipe.findById(recipeId)) {
        return errorResponse('Selected dye recipe does not exist', 404);
      }
      const sequence = await allocateSequence('dye_job_card');
      const jobCardNumber = `DJC-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const lockedFabrics = new Map();
      for (const allocation of normalizedAllocations.slice().sort((left, right) => left.rollNumber.localeCompare(right.rollNumber))) {
        const existingFabric = await Fabric.findOne({ 'rolls.rollNumber': allocation.rollNumber });
        const fabric = existingFabric
          ? lockedFabrics.get(existingFabric._id) || await Fabric.findByIdForUpdate(existingFabric._id)
          : null;
        const roll = fabric?.rolls?.find((item) => item.rollNumber === allocation.rollNumber);
        if (!roll || ['Voided', 'InTransit'].includes(roll.status) || Number(roll.remainingMeters) < allocation.meters) {
          return errorResponse(`Fabric roll ${allocation.rollNumber} is missing or has insufficient stock`, 409);
        }
        lockedFabrics.set(fabric._id, fabric);
      }
      const jobCard = await DyeJobCard.create({
        jobCardNumber,
        targetShade,
        recipeId: recipeId || undefined,
        fabricType,
        issuedRollNumbers: normalizedAllocations.map((allocation) => allocation.rollNumber),
        fabricAllocations: normalizedAllocations,
        inputMeters: inputLength,
        inputWeightKg: weight,
        vatMachineNumber: vatMachineNumber || '',
        status: 'Scheduled',
        chemicalCostTotal: 0,
        laborAndSteamCost: 0,
        totalDyeingCost: 0,
        operatorName: operatorName || '',
      });

      for (const allocation of normalizedAllocations) {
        const fabric = [...lockedFabrics.values()].find((item) =>
          item.rolls?.some((roll) => roll.rollNumber === allocation.rollNumber)
        );
        const roll = fabric.rolls.find((item) => item.rollNumber === allocation.rollNumber);
        roll.remainingMeters -= allocation.meters;
        roll.status = roll.remainingMeters === 0 ? 'Exhausted' : 'Available';
        recordInventoryMovement(fabric, {
          type: 'ISSUE_DYEING',
          quantity: allocation.meters,
          unit: 'Meters',
          direction: 'OUT',
          referenceType: 'DyeJobCard',
          referenceId: jobCard._id,
          referenceNumber: jobCardNumber,
          sourceItemId: allocation.rollNumber,
        });
        fabric.movements[fabric.movements.length - 1].rollNumber = allocation.rollNumber;
        fabric.movements[fabric.movements.length - 1].meters = allocation.meters;
        fabric.movements[fabric.movements.length - 1].referenceDocument = jobCardNumber;
        fabric.movements[fabric.movements.length - 1].performedBy = operatorName || '';
      }
      for (const fabric of lockedFabrics.values()) {
        fabric.totalAvailableMeters = sumAvailableFabricMeters(fabric);
        await fabric.save();
      }

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
      const job = await DyeJobCard.findByIdForUpdate(jobCardId);
      if (!job) return errorResponse('Job Card not found', 404);

      if (labDipApproved !== undefined && typeof labDipApproved !== 'boolean') {
        return errorResponse('Lab dip approval must be a boolean value', 400);
      }
      if (labDipApproved === true) job.labDipApproved = true;
      if (status !== undefined) {
        if (status === job.status) {
          if (status === 'Completed') return errorResponse('This dyeing job has already been completed', 409);
        } else if (status === 'InProgress' && job.status !== 'Scheduled') {
          return errorResponse('Only scheduled dyeing jobs can move into processing', 409);
        } else if (status === 'Completed') {
          const output = Number(outputMeters);
          if (!['Scheduled', 'InProgress'].includes(job.status) || !job.labDipApproved ||
            !Number.isFinite(output) || output <= 0 || output > Number(job.inputMeters)) {
            return errorResponse('A lab-approved job needs a valid actual output quantity before completion', 409);
          }
          const outputFabricId = String(body.outputFabricId || '').trim();
          const outputWarehouseLocation = String(body.outputWarehouseLocation || '').trim();
          if (!outputFabricId || !outputWarehouseLocation) {
            return errorResponse('Select the actual output fabric record and receiving warehouse before completing dyeing', 400);
          }
          const outputFabric = await Fabric.findByIdForUpdate(outputFabricId);
          if (!outputFabric) return errorResponse('The selected output fabric record does not exist', 404);
          job.outputMeters = output;
          job.wastageMeters = Number(job.inputMeters) - output;
          job.shrinkagePercent = ((job.wastageMeters / Number(job.inputMeters)) * 100).toFixed(1);
          const outputWeight = Number(outputWeightKg ?? 0);
          if (!Number.isFinite(outputWeight) || outputWeight < 0) {
            return errorResponse('Output weight must be a non-negative number', 400);
          }
          job.outputWeightKg = outputWeight;
          const rollSequence = await allocateSequence('fabric_roll');
          const outputRollNumber = `ROL-${new Date().getFullYear()}-${String(rollSequence).padStart(5, '0')}`;
          const outputRoll = {
            rollNumber: outputRollNumber,
            barcode: `FAB${String(rollSequence).padStart(10, '0')}`,
            lotNumber: job.jobCardNumber,
            initialMeters: output,
            remainingMeters: output,
            widthInches: Number(outputFabric.widthInches) || 0,
            weightKg: outputWeight,
            gsm: Number(outputFabric.defaultGsm) || 0,
            warehouseLocation: outputWarehouseLocation,
            status: 'Available',
            inspectionNotes: '',
            defectsCount: 0,
            dyeJobCardNumber: job.jobCardNumber,
          };
          outputFabric.rolls = [...(outputFabric.rolls || []), outputRoll];
          outputFabric.movements = Array.isArray(outputFabric.movements) ? outputFabric.movements : [];
          recordInventoryMovement(outputFabric, {
            type: 'DYEING_OUTPUT',
            quantity: output,
            unit: 'Meters',
            referenceType: 'DyeJobCard',
            referenceId: job._id,
            referenceNumber: job.jobCardNumber,
            sourceItemId: outputRollNumber,
            warehouseLocation: outputWarehouseLocation,
            notes: `Actual output from ${job.inputMeters}m input`,
          });
          outputFabric.totalAvailableMeters = sumAvailableFabricMeters(outputFabric);
          await outputFabric.save();
          job.outputFabricId = outputFabric._id;
          job.outputFabricCode = outputFabric.fabricCode;
          job.outputRollNumber = outputRollNumber;
          job.outputWarehouseLocation = outputWarehouseLocation;
          job.completionDate = new Date();
          job.status = 'Completed';
        } else if (status === 'InProgress') {
          job.status = status;
        } else if (status !== 'InProgress') {
          return errorResponse('Unsupported dyeing job status transition', 400);
        }
        if (status !== job.status && status !== 'Completed') job.status = status;
      }

      await job.save();

      return successResponse({ job }, 'Job status updated');
    }

    if (action === 'UPDATE_RECIPE') {
      const recipe = await DyeRecipe.findByIdForUpdate(body.recipeId);
      if (!recipe) return errorResponse('Recipe not found', 404);
      const updates = pickFields(body, [
        'shadeName', 'pantoneCode', 'fabricCompatibility', 'ingredients', 'liquorRatio',
        'temperatureCelsius', 'processTimeMinutes', 'approvedBy',
      ]);
      if (updates.shadeName !== undefined) updates.shadeName = String(updates.shadeName).trim();
      if (updates.shadeName !== undefined && !updates.shadeName) {
        return errorResponse('Dye recipe shade cannot be empty', 400);
      }
      for (const field of ['temperatureCelsius', 'processTimeMinutes']) {
        if (updates[field] === undefined) continue;
        const value = Number(updates[field]);
        if (!Number.isFinite(value) || value < 0) {
          return errorResponse('Dyeing temperature and process time must be non-negative valid numbers', 400);
        }
        updates[field] = value;
      }
      if (updates.ingredients !== undefined) {
        if (!Array.isArray(updates.ingredients) || updates.ingredients.some((ingredient) =>
          !String(ingredient?.chemicalName || '').trim() ||
          !Number.isFinite(Number(ingredient?.ratioGramsPerKg)) ||
          Number(ingredient.ratioGramsPerKg) <= 0
        )) {
          return errorResponse('Each recipe ingredient requires a name and a positive grams-per-kilogram ratio', 400);
        }
        updates.ingredients = updates.ingredients.map((ingredient) => ({
          ...ingredient,
          chemicalName: String(ingredient.chemicalName).trim(),
          ratioGramsPerKg: Number(ingredient.ratioGramsPerKg),
        }));
      }
      Object.assign(recipe, updates);
      await recipe.save();
      return successResponse({ recipe }, 'Recipe updated');
    }

    if (action === 'DELETE_RECIPE') {
      const recipe = await DyeRecipe.findById(body.recipeId);
      if (!recipe) return errorResponse('Recipe not found', 404);
      if ((await DyeJobCard.find({ recipeId: recipe._id })).length) {
        return errorResponse('A dye recipe referenced by job cards cannot be deleted', 409);
      }
      await DyeRecipe.deleteOne({ _id: recipe._id });
      return successResponse({ recipe }, 'Recipe deleted');
    }

    if (action === 'DELETE_JOB_CARD') {
      const job = await DyeJobCard.findById(body.jobCardId);
      if (!job) return errorResponse('Job Card not found', 404);
      if ((job.fabricAllocations || []).length) {
        return errorResponse('A dye job card that consumed fabric cannot be deleted', 409);
      }
      await DyeJobCard.deleteOne({ _id: job._id });
      return successResponse({ job }, 'Job card deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getDyeing, 'dyeing');
export const POST = withAuthorization(postDyeing, 'dyeing', 'write');
