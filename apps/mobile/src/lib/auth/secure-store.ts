import * as SecureStore from 'expo-secure-store';
import type { SecretStore } from './session';

/** Trousseau du système, lisible seulement après le premier déverrouillage et jamais sauvegardé ailleurs. */
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export const secureStore: SecretStore = {
  get: (key) => SecureStore.getItemAsync(key, OPTIONS),
  set: (key, value) => SecureStore.setItemAsync(key, value, OPTIONS),
  delete: (key) => SecureStore.deleteItemAsync(key, OPTIONS),
};
