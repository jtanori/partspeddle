/**
 * In-Memory User Repository — for unit testing.
 *
 * No outbox integration; events remain on the aggregate for test assertions.
 */

import type { IUserRepository } from '../../domain/repositories/user-repository.js';
import { User } from '../../domain/entities/user.js';

export class InMemoryUserRepository implements IUserRepository {
  private readonly users = new Map<string, User>();
  private readonly emailIndex = new Map<string, string>(); // email -> id

  findById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return Promise.resolve(
      user
        ? User.rehydrate({
            id: user.id,
            email: user.email,
            status: user.status,
          })
        : null
    );
  }

  findByEmail(email: string): Promise<User | null> {
    const id = this.emailIndex.get(email);
    if (!id) return Promise.resolve(null);
    return this.findById(id);
  }

  save(user: User): Promise<void> {
    this.users.set(
      user.id,
      User.rehydrate({
        id: user.id,
        email: user.email,
        status: user.status,
      })
    );
    this.emailIndex.set(user.email, user.id);
    return Promise.resolve();
  }

  clear(): void {
    this.users.clear();
    this.emailIndex.clear();
  }
}
