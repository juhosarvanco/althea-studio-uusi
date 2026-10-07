const rememberedKey = 'althea-studio-uusi-remember';
const accessKey = 'althea-studio-uusi-session';

export function sessionCache(storage, transient) {
  return {
    credential(session) {
      const remember = storage.getItem(rememberedKey);
      return remember ? `althea-remember.${remember}` : session?.token || transient.getItem(accessKey);
    },
    save(result) {
      if (result.remember) storage.setItem(rememberedKey, result.remember);
      transient.setItem(accessKey, result.token);
    },
    clear() { storage.removeItem(rememberedKey); transient.removeItem(accessKey); }
  };
}

// Network loss must never erase the remembered identity or require a new code.
export const needsLogin = error => error?.status === 401 || error?.status === 403;
