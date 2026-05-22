import { z } from 'zod';

export const SellerStatusSchema = z.enum(['draft', 'pending_review', 'active', 'suspended']);
export type SellerStatus = z.infer<typeof SellerStatusSchema>;

export const OnboardingStepSchema = z.enum(['identity', 'banking', 'tax', 'terms']);
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

export const RegisterSellerRequestSchema = z.object({
  stripeConnectAccountId: z.string().min(1).max(100),
});

export type RegisterSellerRequest = z.infer<typeof RegisterSellerRequestSchema>;

export const CompleteOnboardingStepRequestSchema = z.object({
  step: OnboardingStepSchema,
});

export type CompleteOnboardingStepRequest = z.infer<typeof CompleteOnboardingStepRequestSchema>;

export const SellerProfileResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  status: SellerStatusSchema,
  stripeConnectAccountId: z.string().optional(),
  activatedAt: z.string().datetime().optional(),
  completedOnboardingSteps: z.array(OnboardingStepSchema),
});

export type SellerProfileResponse = z.infer<typeof SellerProfileResponseSchema>;

export const SellerProfileResponseExample: SellerProfileResponse = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  userId: '550e8400-e29b-41d4-a716-446655440000',
  status: 'active',
  stripeConnectAccountId: 'acct_1234567890',
  activatedAt: '2024-03-01T12:00:00Z',
  completedOnboardingSteps: ['identity', 'banking', 'tax', 'terms'],
};
