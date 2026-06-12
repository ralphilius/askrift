export type NormalizedProvider = 'paddle' | 'gumroad' | 'lemon-squeezy' | 'polar';

export type NormalizedEventType =
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'subscription.paused'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded';

export interface NormalizedEvent<Raw = unknown> {
  provider: NormalizedProvider;
  type: NormalizedEventType;
  id?: string;
  subscriptionId?: string | null;
  customerId?: string | null;
  customerEmail?: string | null;
  productId?: string | null;
  amount?: number | null;
  currency?: string | null;
  occurredAt?: string | null;
  raw: Raw;
}
