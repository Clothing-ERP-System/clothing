# ERPDOST

A garment manufacturing ERP built with Next.js, React, Tailwind CSS and MySQL. The workspace starts empty: it does not create sample products, suppliers, branches or transactions.

## Requirements

- Node.js 20 or newer
- npm
- MySQL 8.0 or newer

## Local setup

1. Create an empty database:

   ```sql
   CREATE DATABASE clothing_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Copy `.env.example` to `.env.local` and set the MySQL connection values. Do not commit `.env.local`.

   PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Install dependencies and start the application:

   ```powershell
   npm install
   npm run dev
   ```

4. Before initial setup, generate a private owner bootstrap token:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Set the output as `INITIAL_SUPERADMIN_SETUP_TOKEN` in `.env.local` (never commit or share it), then restart the app. Enter that token on the first-time setup screen to create the only initial SuperAdmin. Setup is disabled unless this server-side token is configured, and the endpoint cannot create an account after the workspace already has a user.

5. Open [http://localhost:3000](http://localhost:3000).

The application creates its MySQL tables when modules are first used. Existing MongoDB data is not imported.

SuperAdmins can create custom roles from Administration. Each custom role stores explicit per-module view, add, edit, delete, approve, export, and manage permissions. Administration access and system-management actions remain restricted to SuperAdmin.

Design articles, suppliers, and quality inspections support private PDF/JPEG/PNG/WebP attachments up to 10 MB. Files are stored outside `public/`; set `ERP_PRIVATE_STORAGE_DIR` to a persistent private volume in production. Attachment metadata is stored in MySQL and uploads, downloads, and deletions require the associated module permission.

The Reports page can export the current production, fabric, and stock valuation reports as XLSX or PDF. Exports read MySQL records and require the Reports Export permission. Production exports accept date ranges; stock valuation exports represent current balances.

## Production

Configure the same MySQL environment variables in the deployment environment, then run:

```powershell
npm run build
npm start
```

Keep database credentials private. Back up the MySQL database regularly.
