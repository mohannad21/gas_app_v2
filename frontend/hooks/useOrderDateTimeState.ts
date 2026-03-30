import { useEffect, useState } from "react";
import type { UseFormSetValue } from "react-hook-form";

import { buildHappenedAt } from "@/lib/date";

type OrderFormValues = {
  customer_id: string;
  system_id: string;
  delivered_at: string;
  gas_type: "12kg" | "48kg" | "";
  cylinders_installed: string;
  cylinders_received: string;
  price_total: string;
  paid_amount: string;
  note?: string;
};

function getNowDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNowTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function useOrderDateTimeState(setValue: UseFormSetValue<OrderFormValues>) {
  const [deliveryDateOpen, setDeliveryDateOpen] = useState(false);
  const [deliveryTimeOpen, setDeliveryTimeOpen] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(getNowDate());
  const [deliveryTime, setDeliveryTime] = useState(getNowTime());

  const [collectionDateOpen, setCollectionDateOpen] = useState(false);
  const [collectionTimeOpen, setCollectionTimeOpen] = useState(false);
  const [collectionDate, setCollectionDate] = useState(getNowDate());
  const [collectionTime, setCollectionTime] = useState(getNowTime());

  // Sync deliveryDate + deliveryTime to form field "delivered_at"
  useEffect(() => {
    const next = buildHappenedAt({ date: deliveryDate, time: deliveryTime });
    if (!next) return;
    setValue("delivered_at", next);
  }, [deliveryDate, deliveryTime, setValue]);

  return {
    deliveryDate,
    setDeliveryDate,
    deliveryDateOpen,
    setDeliveryDateOpen,
    deliveryTime,
    setDeliveryTime,
    deliveryTimeOpen,
    setDeliveryTimeOpen,
    collectionDate,
    setCollectionDate,
    collectionDateOpen,
    setCollectionDateOpen,
    collectionTime,
    setCollectionTime,
    collectionTimeOpen,
    setCollectionTimeOpen,
  };
}
