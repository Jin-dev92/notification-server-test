import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { getDevtoolsConfig } from '../constants/env';

interface UserStore {
  userId: string | null;
  setUserId: (id: string) => void;
}

export const useUserStore = create<UserStore>()(
  devtools(
    (set) => ({
      userId: null,
      setUserId: (userId) => set({ userId }),
    }),
    getDevtoolsConfig('user-store'),
  ),
);
