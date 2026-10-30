import { createMySQLModel } from '@/lib/mysql-model.js';

export const DyeRecipe = createMySQLModel('DyeRecipe', ['recipeCode']);
export const DyeJobCard = createMySQLModel('DyeJobCard', ['jobCardNumber']);
