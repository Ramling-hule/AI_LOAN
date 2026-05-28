import 'dotenv/config';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { Permission, Role } from '../models/index.js';
import { connectDB } from '../config/db.js';

const PERMISSIONS = [
  // Loan permissions
  {
    name: 'loan:create',
    display_name: 'Create Loan Application',
    description: 'Allows creation of new loan requests',
    resource: 'loan',
    action: 'create',
  },
  {
    name: 'loan:read',
    display_name: 'View Loan Application',
    description: 'Allows reading loan requests and details',
    resource: 'loan',
    action: 'read',
  },
  {
    name: 'loan:update',
    display_name: 'Update Loan Application',
    description: 'Allows modification of draft or requested loans',
    resource: 'loan',
    action: 'update',
  },
  {
    name: 'loan:delete',
    display_name: 'Delete Loan Application',
    description: 'Allows deleting loan requests',
    resource: 'loan',
    action: 'delete',
  },
  {
    name: 'loan:approve',
    display_name: 'Approve Loan Application',
    description: 'Allows approval of loan requests',
    resource: 'loan',
    action: 'approve',
  },
  {
    name: 'loan:reject',
    display_name: 'Reject Loan Application',
    description: 'Allows rejection of loan requests',
    resource: 'loan',
    action: 'reject',
  },
  // Audit log permissions
  {
    name: 'audit:read',
    display_name: 'View Audit Logs',
    description: 'Allows viewing security audit logs',
    resource: 'audit',
    action: 'read',
  },
  // User management permissions
  {
    name: 'user:read',
    display_name: 'View Users',
    description: 'Allows reading user records',
    resource: 'user',
    action: 'read',
  },
];

const ROLES = [
  {
    name: 'sme_applicant',
    display_name: 'SME Applicant',
    description: 'Default role for business owners applying for funding',
    scope: 'sme',
    permissionNames: ['loan:create', 'loan:read', 'loan:update'],
  },
  {
    name: 'bank_underwriter',
    display_name: 'Bank Underwriter',
    description: 'Default role for credit risk officers evaluating loan applications',
    scope: 'bank',
    permissionNames: ['loan:read', 'loan:approve', 'loan:reject'],
  },
  {
    name: 'bank_admin',
    display_name: 'Bank Administrator',
    description: 'Branch manager role who can manage users and approve applications',
    scope: 'bank',
    permissionNames: ['loan:read', 'loan:approve', 'loan:reject', 'user:read'],
  },
  {
    name: 'super_admin',
    display_name: 'Super Admin',
    description: 'Full system administrator with access to all actions and audit logging',
    scope: 'system',
    permissionNames: ['loan:create', 'loan:read', 'loan:update', 'loan:delete', 'loan:approve', 'loan:reject', 'audit:read', 'user:read'],
  },
];

const seed = async () => {
  try {
    console.log('🔄 Connecting to database to seed roles and permissions...');
    await connectDB();

    console.log('🔄 Seeding permissions...');
    const dbPermissionsMap = {};

    for (const p of PERMISSIONS) {
      let doc = await Permission.findOne({ name: p.name });
      if (!doc) {
        doc = await Permission.create({
          _id: uuidv4(),
          ...p,
        });
        console.log(`+ Created Permission: ${p.name}`);
      } else {
        // Update existing permission
        doc.display_name = p.display_name;
        doc.description = p.description;
        doc.resource = p.resource;
        doc.action = p.action;
        await doc.save();
        console.log(`~ Updated Permission: ${p.name}`);
      }
      dbPermissionsMap[p.name] = doc._id;
    }

    console.log('🔄 Seeding roles...');
    for (const r of ROLES) {
      const mappedPermissionIds = r.permissionNames
        .map(name => dbPermissionsMap[name])
        .filter(Boolean);

      let doc = await Role.findOne({ name: r.name });
      if (!doc) {
        doc = await Role.create({
          _id: uuidv4(),
          name: r.name,
          display_name: r.display_name,
          description: r.description,
          scope: r.scope,
          permissions: mappedPermissionIds,
        });
        console.log(`+ Created Role: ${r.name}`);
      } else {
        // Update existing role
        doc.display_name = r.display_name;
        doc.description = r.description;
        doc.scope = r.scope;
        doc.permissions = mappedPermissionIds;
        await doc.save();
        console.log(`~ Updated Role: ${r.name}`);
      }
    }

    console.log('✅ Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🛑 Connection closed.');
    process.exit(0);
  }
};

seed();
