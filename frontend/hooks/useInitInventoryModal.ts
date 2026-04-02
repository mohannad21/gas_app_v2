import { useRef, useState } from "react";

export function useInitInventoryModal() {
  const [initModalVisible, setInitModalVisible] = useState(false);
  const [initCounts, setInitCounts] = useState({
    full12: "",
    empty12: "",
    full48: "",
    empty48: "",
  });
  const [initDateOpen, setInitDateOpen] = useState(false);
  const [initDate, setInitDate] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

  // Ref to prevent showing modal multiple times
  const inventoryPromptedRef = useRef(false);

  // Helper to reset the modal state
  const resetModal = () => {
    setInitModalVisible(false);
    setInitCounts({ full12: "", empty12: "", full48: "", empty48: "" });
    setInitDateOpen(false);
  };

  return {
    initModalVisible,
    setInitModalVisible,
    initCounts,
    setInitCounts,
    initDateOpen,
    setInitDateOpen,
    initDate,
    setInitDate,
    inventoryPromptedRef,
    resetModal,
  };
}
