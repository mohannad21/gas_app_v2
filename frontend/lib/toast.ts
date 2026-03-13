type Listener = (message: string | null) => void;

const listeners = new Set<Listener>();
let hideTimer: NodeJS.Timeout | null = null;

export function showToast(message: string, durationMs = 2500) {
  // Notify listeners with the new message
  listeners.forEach((cb) => cb(message));
  // Auto-hide after duration
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    listeners.forEach((cb) => cb(null));
  }, durationMs);
}

export function subscribeToast(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

