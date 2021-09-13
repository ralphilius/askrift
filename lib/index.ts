import { VercelRequest } from "@vercel/node";
import { Request } from 'express';
import { 
  SubscriptionCancelled, 
  SubscriptionCreated, 
  SubscriptionPaymentFailed, 
  SubscriptionPaymentRefunded, 
  SubscriptionPaymentSucceeded, 
  SubscriptionUpdated } from "../types/paddle/subscription";
import Paddle from "./paddle";

export default abstract class Askrift<SC extends keyof namesTyped> implements ISubscriptionCreated<SC> {
  onSubscriptionCanceled(): Promise<namesTyped[SC]["canceled"]> {
    throw new Error("Method not implemented.");
  }
  onSubscriptionUpdated(): Promise<namesTyped[SC]["updated"]> {
    throw new Error("Method not implemented.");
  }
  onPaymentSucceeded(): Promise<namesTyped[SC]["paymentSucceeded"]> {
    throw new Error("Method not implemented.");
  }
  onPaymentFailed(): Promise<namesTyped[SC]["paymentFailed"]> {
    throw new Error("Method not implemented.");
  }
  onPaymentRefunded(): Promise<namesTyped[SC]["paymentRefunded"]> {
    throw new Error("Method not implemented.");
  }
  onSubscriptionCreated(): Promise<namesTyped[SC]['created']> {
    throw new Error("Method not implemented.");
  }

  static initialize<T extends keyof namesTyped>(type: T, body: VercelRequest | Request): Askrift<T> {
    return new Paddle(body);
  };

  abstract validRequest(): boolean;
  abstract validPayload(): boolean;
}

type namesTyped = {
  paddle: {
    created: SubscriptionCreated | null
    updated: SubscriptionUpdated | null
    paymentSucceeded: SubscriptionPaymentSucceeded | null
    paymentFailed: SubscriptionPaymentFailed | null
    paymentRefunded: SubscriptionPaymentRefunded | null
    canceled: SubscriptionCancelled | null
  }
}

interface ISubscriptionCreated<SC extends keyof namesTyped> {
  onSubscriptionCreated(): Promise<namesTyped[SC]['created']>
  onSubscriptionCanceled(): Promise<namesTyped[SC]['canceled']>
  onSubscriptionUpdated(): Promise<namesTyped[SC]['updated']>
  onPaymentSucceeded(): Promise<namesTyped[SC]['paymentSucceeded']>;
  onPaymentFailed(): Promise<namesTyped[SC]['paymentFailed']>;
  onPaymentRefunded(): Promise<namesTyped[SC]['paymentRefunded']>;
}

type Callback<T> = (data: T) => void;