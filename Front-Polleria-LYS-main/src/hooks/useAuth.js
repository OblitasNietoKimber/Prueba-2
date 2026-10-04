import { useSyncExternalStore } from 'react';
import { subscribe, getAuthSnapshot } from '../services/authService';

export function useAuth() {
  return useSyncExternalStore(subscribe, getAuthSnapshot, getAuthSnapshot);
}
