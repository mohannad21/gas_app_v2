export type CustomerListTopFilter =
  | "all"
  | "money"
  | "cyl12"
  | "cyl48"
  | "systems"
  | "security_check";

export type CustomerListSubFilter =
  | "all"
  | "debt"
  | "credit"
  | "active"
  | "inactive"
  | "required"
  | "not_required";

export const customerTopFilterOptions: { id: CustomerListTopFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "money", label: "Money" },
  { id: "cyl12", label: "12kg" },
  { id: "cyl48", label: "48kg" },
  { id: "systems", label: "Systems" },
  { id: "security_check", label: "Security check" },
];

export function getCustomerSubFilterOptions(topFilter: CustomerListTopFilter) {
  switch (topFilter) {
    case "money":
    case "cyl12":
    case "cyl48":
      return [
        { id: "all" as const, label: "All" },
        { id: "debt" as const, label: "Debt" },
        { id: "credit" as const, label: "Credit" },
      ];
    case "systems":
      return [
        { id: "all" as const, label: "All" },
        { id: "active" as const, label: "Active" },
        { id: "inactive" as const, label: "Inactive" },
      ];
    case "security_check":
      return [
        { id: "all" as const, label: "All" },
        { id: "required" as const, label: "Required" },
        { id: "not_required" as const, label: "Not required" },
      ];
    default:
      return [{ id: "all" as const, label: "All" }];
  }
}
