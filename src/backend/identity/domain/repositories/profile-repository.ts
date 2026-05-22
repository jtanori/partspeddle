import { Profile } from '../entities/profile.js';

export interface IProfileRepository {
  findByUserId(userId: string): Promise<Profile | null>;
  findById(id: string): Promise<Profile | null>;
  save(profile: Profile): Promise<void>;
}
