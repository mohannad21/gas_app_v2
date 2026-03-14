import { AddCustomerEntryAction, AddCustomersSection } from "./add/index";

export default function CustomersHomeScreen() {
  return (
    <>
      <AddCustomerEntryAction />
      <AddCustomersSection />
    </>
  );
}
