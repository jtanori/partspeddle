/**
 * Identity domain API wrappers.
 *
 * All identity-related backend calls flow through here.
 */

import { apiGet, apiPost, apiPut } from './client';
import type { UserResponse } from '@/shared/contracts/identity/user-schema';
import type {
  ProfileResponse,
  UpdateProfileRequest,
} from '@/shared/contracts/identity/profile-schema';
import type {
  SellerProfileResponse,
  RegisterSellerRequest,
  CompleteOnboardingStepRequest,
} from '@/shared/contracts/identity/seller-schema';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function identityUrl(path: string): string {
  return `${API_BASE}/identity${path}`;
}

export async function getCurrentUser(): Promise<UserResponse> {
  return apiGet<UserResponse>(identityUrl('/users/me'));
}

export async function getUser(userId: string): Promise<UserResponse> {
  return apiGet<UserResponse>(identityUrl(`/users/${userId}`));
}

export async function getProfile(userId: string): Promise<ProfileResponse> {
  return apiGet<ProfileResponse>(identityUrl(`/users/${userId}/profile`));
}

export async function updateProfile(
  userId: string,
  request: UpdateProfileRequest
): Promise<ProfileResponse> {
  return apiPut<ProfileResponse>(identityUrl(`/users/${userId}/profile`), request);
}

export async function getSellerProfile(userId: string): Promise<SellerProfileResponse> {
  return apiGet<SellerProfileResponse>(identityUrl(`/users/${userId}/seller`));
}

export async function registerSeller(
  userId: string,
  request: RegisterSellerRequest
): Promise<SellerProfileResponse> {
  return apiPost<SellerProfileResponse>(identityUrl(`/users/${userId}/seller`), request);
}

export async function completeOnboardingStep(
  userId: string,
  request: CompleteOnboardingStepRequest
): Promise<SellerProfileResponse> {
  return apiPost<SellerProfileResponse>(identityUrl(`/users/${userId}/seller/onboarding`), request);
}
