export function isObject(obj: any) {
  return obj !== undefined && obj !== null && obj.constructor == Object;
}