# ERPDOST

A garment manufacturing ERP built with Next.js, React, Tailwind CSS, MySQL and JWT authentication. The workspace starts empty: it does not create sample users, products, suppliers, branches or transactions.

## Requirements

- Node.js 20 or newer
- npm
- MySQL 8.0 or newer

## Local setup

1. Create an empty database:

   ```sql
   CREATE DATABASE clothing_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Copy `.env.example` to `.env.local` and set the MySQL connection values. Set `JWT_SECRET` to a private random value with at least 32 characters. Do not commit `.env.local`.

   PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Install dependencies and start the application:

   ```powershell
   npm install
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000). On an empty database, the login screen lets you create the first administrator. There are no default login credentials.

The application creates its MySQL tables when each module is first used. Existing MongoDB data is not imported.

## Production

Configure the same MySQL and JWT environment variables in the deployment environment, then run:

```powershell
npm run build
npm start
```

Keep `JWT_SECRET` private and stable between restarts. Back up the MySQL database regularly.
