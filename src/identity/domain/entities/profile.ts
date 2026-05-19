/**
 * Profile entity — public user-facing profile data.
 *
 * Owned by the Identity domain. Created lazily on first authenticated request
 * or via webhook reconciliation.
 */

export interface ProfileProps {
  readonly id: string;
  readonly userId: string;
  readonly displayName?: string;
  readonly avatarUrl?: string;
}

export class Profile {
  readonly id: string;
  readonly userId: string;
  private _displayName: string | undefined;
  private _avatarUrl: string | undefined;

  constructor(props: ProfileProps) {
    this.id = props.id;
    this.userId = props.userId;
    this._displayName = props.displayName;
    this._avatarUrl = props.avatarUrl;
    this._validate();
  }

  get displayName(): string | undefined {
    return this._displayName;
  }

  get avatarUrl(): string | undefined {
    return this._avatarUrl;
  }

  updateDisplayName(name: string | undefined): void {
    this._displayName = name;
  }

  updateAvatarUrl(url: string | undefined): void {
    this._avatarUrl = url;
  }

  private _validate(): void {
    if (!this.id) throw new Error('Profile.id is required');
    if (!this.userId) throw new Error('Profile.userId is required');
  }
}
