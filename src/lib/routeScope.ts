import type { StaffContext } from "@/lib/getStaffContext";
import type { CustomerSummary } from "@/lib/customerWorkspace";
import type { RouteStopQueueRow } from "@/lib/routeStopQueue";

export function canSalesAccessRoute(args: {
  staff: StaffContext;
  assignedUserId: string | null;
  createdByUserId: string | null;
}) {
  if (args.staff.role === "admin") return true;
  return args.assignedUserId === args.staff.userId || args.createdByUserId === args.staff.userId;
}

export function scopeRouteCustomersForStaff(args: {
  staff: StaffContext;
  customers: CustomerSummary[];
  pendingQueueRows: RouteStopQueueRow[];
}) {
  if (args.staff.role === "admin") return args.customers;

  const allowedCustomerIds = new Set<string>();

  for (const customer of args.customers) {
    if (customer.assignedRouteRepUserId === args.staff.userId) {
      allowedCustomerIds.add(customer.id);
    }
  }

  for (const row of args.pendingQueueRows) {
    allowedCustomerIds.add(row.customerId);
  }

  return args.customers.filter((customer) => allowedCustomerIds.has(customer.id));
}
