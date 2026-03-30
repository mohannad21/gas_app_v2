import { useState } from "react";

export function useDeleteConfirm() {
  const [confirm, setConfirm] = useState<{ type: "order" | "collection"; id: string; name?: string } | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const markDeleting = (id: string) => {
    setDeletingIds((prev) => new Set([...prev, id]));
  };

  const unmarkDeleting = (id: string) => {
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return {
    confirm,
    setConfirm,
    deletingIds,
    setDeletingIds,
    markDeleting,
    unmarkDeleting,
  };
}
