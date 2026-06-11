import { PaddleBillingEventType } from "./billing";
import { PaddleClassicAlertName } from "./classic";

export type PaddleWebhookProvider = "classic" | "billing";

export interface NormalizedPaddleWebhookEvent<TPayload = unknown> {
  provider: PaddleWebhookProvider;
  type: PaddleClassicAlertName | PaddleBillingEventType;
  id?: string;
  occurredAt?: string;
  payload: TPayload;
}
