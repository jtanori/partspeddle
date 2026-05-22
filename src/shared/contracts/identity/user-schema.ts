import { z } from 'zod';

export const UserStatusSchema = z.enum(['active', 'suspended', 'deactivated']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  status: UserStatusSchema,
  authProvider: z.string(),
  createdAt: z.string().datetime().optional(),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;

export const UserResponseExample: UserResponse = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'user@example.com',
  status: 'active',
  authProvider: 'supabase',
  createdAt: '2024-01-15T10:30:00Z',
};
