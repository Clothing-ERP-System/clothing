import { createMySQLModel } from '@/lib/mysql-model.js';

export default createMySQLModel('Location', ['locationCode']);

// Location model supports an optional warehouse field for bin-level tracking.
// Locations are associated with a warehouse to prevent cross-warehouse
// location assignment in stock transfers. The warehouse field is additive
// and does not affect existing location records.
