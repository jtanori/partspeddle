import { SellerProfile } from '../entities/seller-profile.js';

export interface ISellerProfileRepository {
  findById(id: string): Promise<SellerProfile | null>;
  findByUserId(userId: string): Promise<SellerProfile | null>;
  save(profile: SellerProfile): Promise<void>;
}
