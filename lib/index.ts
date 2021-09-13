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

export default abstract class Askrift<SC extends keyof TypesMap> implements ISubscriptionCreated<SC> {
  onSubscriptionCanceled(): Promise<TypesMap[SC]["canceled"]> {
    throw new Error("Method not implemented.");
  }
  onSubscriptionUpdated(): Promise<TypesMap[SC]["updated"]> {
    throw new Error("Method not implemented.");
  }
  onPaymentSucceeded(): Promise<TypesMap[SC]["paymentSucceeded"]> {
    throw new Error("Method not implemented.");
  }
  onPaymentFailed(): Promise<TypesMap[SC]["paymentFailed"]> {
    throw new Error("Method not implemented.");
  }
  onPaymentRefunded(): Promise<TypesMap[SC]["paymentRefunded"]> {
    throw new Error("Method not implemented.");
  }
  onSubscriptionCreated(): Promise<TypesMap[SC]['created']> {
    throw new Error("Method not implemented.");
  }

  static initialize<T extends keyof TypesMap>(type: T, body: VercelRequest | Request): Askrift<T> {
    return new Paddle(body);
  };

  abstract validRequest(): boolean;
  abstract validPayload(): boolean;
}

type TypesMap = {
  paddle: {
    created: SubscriptionCreated | null
    updated: SubscriptionUpdated | null
    paymentSucceeded: SubscriptionPaymentSucceeded | null
    paymentFailed: SubscriptionPaymentFailed | null
    paymentRefunded: SubscriptionPaymentRefunded | null
    canceled: SubscriptionCancelled | null
  }
}

interface ISubscriptionCreated<Vendor extends keyof TypesMap> {
  onSubscriptionCreated(): Promise<TypesMap[Vendor]['created']>
  onSubscriptionCanceled(): Promise<TypesMap[Vendor]['canceled']>
  onSubscriptionUpdated(): Promise<TypesMap[Vendor]['updated']>
  onPaymentSucceeded(): Promise<TypesMap[Vendor]['paymentSucceeded']>;
  onPaymentFailed(): Promise<TypesMap[Vendor]['paymentFailed']>;
  onPaymentRefunded(): Promise<TypesMap[Vendor]['paymentRefunded']>;
}

type Callback<T> = (data: T) => void;