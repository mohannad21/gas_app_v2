import { useEffect, useState } from "react";
import type { UseFormSetValue } from "react-hook-form";

import { buildActivityHappenedAt, getCurrentLocalDate, getCurrentLocalTime } from "@/lib/date";

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

export function useOrderDateTimeState(setValue: UseFormSetValue<OrderFormValues>) {
  const [deliveryDateOpen, setDeliveryDateOpen] = useState(false);
  const [deliveryTimeOpen, setDeliveryTimeOpen] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(getCurrentLocalDate());
  const [deliveryTime, setDeliveryTime] = useState(getCurrentLocalTime({ includeSeconds: true }));

  const [collectionDateOpen, setCollectionDateOpen] = useState(false);
  const [collectionTimeOpen, setCollectionTimeOpen] = useState(false);
  const [collectionDate, setCollectionDate] = useState(getCurrentLocalDate());
  const [collectionTime, setCollectionTime] = useState(getCurrentLocalTime({ includeSeconds: true }));

  // Sync deliveryDate + deliveryTime to form field "delivered_at"
  useEffect(() => {
    const next = buildActivityHappenedAt({ date: deliveryDate, time: deliveryTime });
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
