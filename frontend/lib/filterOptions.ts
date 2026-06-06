import { ACTIVITY_KIND_META, FILTER_GROUP_LABELS } from "@/lib/activityKindMeta";
import type { ActivityKind } from "@/lib/activityKinds";

export type SubFilterOption = {
  id: string;
  label: string;
};

export type KindOption = {
  id: ActivityKind;
  label: string;
  subFilters: SubFilterOption[];
};

export type GroupOption = {
  id: "customer" | "company" | "expenses" | "ledger";
  label: string;
  kinds: KindOption[];
};

const kind = (id: ActivityKind, subFilters: SubFilterOption[] = []): KindOption => ({
  id,
  label: ACTIVITY_KIND_META[id]?.label ?? id,
  subFilters,
});

const sub = (id: string, label: string): SubFilterOption => ({ id, label });

export const FILTER_HIERARCHY: GroupOption[] = [
  {
    id: "customer",
    label: FILTER_GROUP_LABELS.customer,
    kinds: [
      kind("replacement", [
        sub("12kg_debt", "12kg — debt"),
        sub("12kg_credit", "12kg — credit"),
        sub("48kg_debt", "48kg — debt"),
        sub("48kg_credit", "48kg — credit"),
        sub("money_debt", "Money — debt"),
        sub("money_credit", "Money — credit"),
      ]),
      kind("payment_from_customer"),
      kind("customer_return_empties", [
        sub("12kg", "12kg"),
        sub("48kg", "48kg"),
      ]),
      kind("payment_to_customer"),
      kind("sell_full", [
        sub("12kg_debt", "12kg — debt"),
        sub("12kg_credit", "12kg — credit"),
        sub("48kg_debt", "48kg — debt"),
        sub("48kg_credit", "48kg — credit"),
        sub("money_debt", "Money — debt"),
        sub("money_credit", "Money — credit"),
      ]),
      kind("buy_empty_from_customer", [
        sub("12kg", "12kg"),
        sub("48kg", "48kg"),
      ]),
      kind("adjust_customer_balance", [
        sub("12kg", "12kg"),
        sub("48kg", "48kg"),
        sub("money", "Money"),
      ]),
    ],
  },
  {
    id: "company",
    label: FILTER_GROUP_LABELS.company,
    kinds: [
      kind("refill", [
        sub("12kg_debt", "12kg — debt"),
        sub("12kg_credit", "12kg — credit"),
        sub("48kg_debt", "48kg — debt"),
        sub("48kg_credit", "48kg — credit"),
        sub("money_debt", "Money — debt"),
        sub("money_credit", "Money — credit"),
      ]),
      kind("payment_to_company"),
      kind("dist_return_empties", [
        sub("12kg", "12kg"),
        sub("48kg", "48kg"),
      ]),
      kind("payment_from_company"),
      kind("buy_full_from_company", [
        sub("money_debt", "Money — debt"),
        sub("money_credit", "Money — credit"),
      ]),
      kind("adjust_company_balance", [
        sub("12kg", "12kg"),
        sub("48kg", "48kg"),
        sub("money", "Money"),
      ]),
    ],
  },
  {
    id: "expenses",
    label: FILTER_GROUP_LABELS.expenses,
    kinds: [
      kind("expense"),
      kind("bank_to_wallet"),
      kind("wallet_to_bank"),
    ],
  },
  {
    id: "ledger",
    label: FILTER_GROUP_LABELS.ledger,
    kinds: [
      kind("adjust_wallet"),
      kind("adjust_inventory", [
        sub("12kg_full", "12kg full"),
        sub("12kg_empty", "12kg empty"),
        sub("48kg_full", "48kg full"),
        sub("48kg_empty", "48kg empty"),
      ]),
    ],
  },
];

export function getGroupOptions(): GroupOption[] {
  return FILTER_HIERARCHY;
}

export function getKindOptions(groupId: string): KindOption[] {
  return FILTER_HIERARCHY.find((g) => g.id === groupId)?.kinds ?? [];
}

export function getSubFilterOptions(groupId: string, kindId: string): SubFilterOption[] {
  return getKindOptions(groupId).find((k) => k.id === kindId)?.subFilters ?? [];
}
