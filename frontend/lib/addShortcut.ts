type AddShortcut = {
  mode: "inventory";
  date?: string;
};

let pendingShortcut: AddShortcut | null = null;

export function setAddShortcut(next: AddShortcut | null) {
  pendingShortcut = next;
}

export function consumeAddShortcut(): AddShortcut | null {
  const current = pendingShortcut;
  pendingShortcut = null;
  return current;
}

