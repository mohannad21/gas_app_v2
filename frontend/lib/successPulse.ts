type Listener = () => void;

const listeners = new Set<Listener>();

export function showSuccessPulse() {
  listeners.forEach((listener) => listener());
}

export function subscribeSuccessPulse(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
