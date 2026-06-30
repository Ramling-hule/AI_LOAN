import { z } from 'zod';





export const createLoanSchema = z.object({
  applicantId: z.string().min(1, 'Applicant ID is required'),
  loanAmount: z.number().positive('Loan amount must be positive'),
  loanPurpose: z.string().min(5, 'Loan purpose must be at least 5 characters').max(500),
  tenureMonths: z.number().int().min(1).max(360),
  businessName: z.string().min(2).max(200),
  businessType: z.enum(['sole_proprietorship', 'partnership', 'pvt_ltd', 'llp', 'other']),
  annualRevenue: z.number().positive().optional(),
  yearsInOperation: z.number().int().min(0).optional(),
});

export const updateLoanSchema = createLoanSchema.partial();

export const loanQuerySchema = z.object({
  status: z
    .enum(['pending', 'under_review', 'approved', 'rejected', 'disbursed'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'loanAmount', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
