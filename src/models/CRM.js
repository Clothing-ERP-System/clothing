import { createMySQLModel } from '@/lib/mysql-model.js';

export const CRMLead = createMySQLModel('CRMLead', ['leadCode']);
export const MarketingCampaign = createMySQLModel('MarketingCampaign');
