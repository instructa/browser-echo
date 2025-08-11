// JSDOM + small polyfills for browser-ish tests
// crypto.getRandomValues
if (typeof globalThis.crypto === 'undefined') {
  // @ts-expect-error – fill minimal crypto for tests
  globalThis.crypto = { getRandomValues(arr: Uint8Array) {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  }} as Crypto;
}
// navigator.sendBeacon
if (typeof (globalThis as any).navigator === 'undefined') {
  // @ts-expect-error
  globalThis.navigator = {};
}
if (!(globalThis as any).navigator.sendBeacon) {
  (globalThis as any).navigator.sendBeacon = () => true;
}
