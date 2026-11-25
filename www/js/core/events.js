const listeners = new Map();

export const events = {
  on(eventName, handler) {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set());
    }
    listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  },

  off(eventName, handler) {
    const set = listeners.get(eventName);
    if (set) set.delete(handler);
  },

  emit(eventName, payload) {
    const set = listeners.get(eventName);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[events] erro em "${eventName}":`, err);
      }
    }
  }
};
