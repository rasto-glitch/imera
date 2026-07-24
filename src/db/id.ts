import * as Crypto from 'expo-crypto';

// Hermes has no crypto.randomUUID; expo-crypto provides a native one.
export function newId(): string {
  return Crypto.randomUUID();
}
