import { useState } from "react";

export function useCollectionEdit() {
  const [collectionEditOpen, setCollectionEditOpen] = useState(false);
  const [collectionEditTarget, setCollectionEditTarget] = useState<any | null>(null);
  const [collectionAmount, setCollectionAmount] = useState("");
  const [collectionQty12, setCollectionQty12] = useState("");
  const [collectionQty48, setCollectionQty48] = useState("");
  const [collectionNote, setCollectionNote] = useState("");

  const resetCollectionForm = () => {
    setCollectionEditOpen(false);
    setCollectionEditTarget(null);
    setCollectionAmount("");
    setCollectionQty12("");
    setCollectionQty48("");
    setCollectionNote("");
  };

  return {
    collectionEditOpen,
    setCollectionEditOpen,
    collectionEditTarget,
    setCollectionEditTarget,
    collectionAmount,
    setCollectionAmount,
    collectionQty12,
    setCollectionQty12,
    collectionQty48,
    setCollectionQty48,
    collectionNote,
    setCollectionNote,
    resetCollectionForm,
  };
}
