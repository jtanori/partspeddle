import { z } from 'zod';

export const UpdateProfileRequestSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().max(500).optional(),
});

export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const ProfileResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
});

export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

export const ProfileResponseExample: ProfileResponse = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  userId: '550e8400-e29b-41d4-a716-446655440000',
  displayName: 'Jane Doe',
  avatarUrl: 'https://example.com/avatar.jpg',
};
