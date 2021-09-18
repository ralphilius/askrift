import { VercelRequest } from "@vercel/node";
import { Request } from 'express';
import { 
  SubscriptionCancelled, 
  SubscriptionCreated, 
  SubscriptionPaymentFailed, 
  SubscriptionPaymentRefunded, 
  SubscriptionPaymentSucceeded, 
  SubscriptionUpdated } from "../types/paddle/subscription";

export default abstract class Askrift<SC extends keyof TypesMap> implements ISubscriptionCreated<SC> {
  private _debug: boolean;
  constructor(debug?: boolean){
    this._debug = debug || false;
  }
  abstract onSubscriptionCanceled(): Promise<TypesMap[SC]["canceled"]>;
  abstract onSubscriptionUpdated(): Promise<TypesMap[SC]["updated"]>;
  abstract onPaymentSucceeded(): Promise<TypesMap[SC]["paymentSucceeded"]>;
  abstract onPaymentFailed(): Promise<TypesMap[SC]["paymentFailed"]>;
  abstract onPaymentRefunded(): Promise<TypesMap[SC]["paymentRefunded"]>;
  abstract onSubscriptionCreated(): Promise<TypesMap[SC]['created']>;

  public debug(msg: any, ...optionalParams: any[]){
    if(this._debug) console.log(msg, ...optionalParams);
  }

  abstract validRequest(): boolean;
  abstract validPayload(): boolean;
}

export type TypesMap = {
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