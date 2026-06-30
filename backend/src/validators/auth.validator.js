import { z } from 'zod';







const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character');

const phoneRegex = /^\+?[1-9]\d{7,14}$/;



export const smeRegisterSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(150),
  business_name: z
    .string()
    .trim()
    .min(2, 'Business name must be at least 2 characters')
    .max(200),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Please provide a valid phone number'),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: strongPassword,
  address: z
    .object({
      street: z.string().trim().optional(),
      city: z.string().trim().optional(),
      state: z.string().trim().optional(),
      pincode: z.string().trim().optional(),
      country: z.string().trim().default('India'),
    })
    .optional(),
});



export const bankAdminRegisterSchema = z.object({
  bank_name: z.string().trim().min(2).max(200),
  branch_name: z.string().trim().min(2).max(200),
  branch_address: z
    .object({
      street: z.string().trim().optional(),
      city: z.string().trim().optional(),
      state: z.string().trim().optional(),
      pincode: z.string().trim().optional(),
      country: z.string().trim().default('India'),
    })
    .optional(),
  ifsc_code: z
    .string()
    .trim()
    .toUpperCase()
    .max(11)
    .optional(),
  admin_name: z.string().trim().min(2).max(150),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Please provide a valid phone number')
    .optional(),
  password: strongPassword,
});



export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});



export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
});
