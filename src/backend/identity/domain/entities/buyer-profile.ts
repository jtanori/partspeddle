/**
 * BuyerProfile entity — minimal footprint, lazy-created on first buyer action.
 */

export interface BuyerProfileProps {
  readonly id: string;
  readonly userId: string;
}

export class BuyerProfile {
  readonly id: string;
  readonly userId: string;

  constructor(props: BuyerProfileProps) {
    this.id = props.id;
    this.userId = props.userId;
    this._validate();
  }

  private _validate(): void {
    if (!this.id) throw new Error('BuyerProfile.id is required');
    if (!this.userId) throw new Error('BuyerProfile.userId is required');
  }
}
