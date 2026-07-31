import { isNamelessCustomer } from "@/lib/namelessCustomerAccess";
import { createAdminClient } from "@/lib/supabase/admin";

type GenericRow = Record<string, unknown>;

export type RetailSalesAccountData = {
  account: {
    legalBusinessName: string | null;
    dbaName: string | null;
    licenseNumber: string | null;
    licenseType: string | null;
    licenseStatus: string | null;
    instagram: string | null;
    distributor: string | null;
    numberOfLocations: number;
    currentBrandsCarried: string[];
    leadSource: string | null;
    ownershipStatus: string;
    accountSubmittedBy: string | null;
    accountSubmittedAt: string | null;
    ownershipVerifiedBy: string | null;
    ownershipVerifiedAt: string | null;
    ownershipNotes: string | null;
    commissionEligible: boolean;
    commissionRate: number;
    commissionStartDate: string | null;
    commissionExpirationDate: string | null;
  };
  opportunities: GenericRow[];
  samples: GenericRow[];
  orders: GenericRow[];
  commission: {
    commissionableSalesThisMonth: number;
    estimatedCommissionThisMonth: number;
    approvedUnpaidCommission: number;
    paidCommission: number;
  };
};

function text(value: unknown) {
  const result = String(value || "").trim();
  return result || null;
}

function number(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

export async function loadRetailSalesAccountData(customerId: string): Promise<RetailSalesAccountData | null> {
  if (!(await isNamelessCustomer(customerId))) return null;
  const admin = createAdminClient();
  const [customerRes, opportunityRes, sampleRes, orderRes] = await Promise.all([
    admin
      .from("customers")
      .select("legal_business_name, dba_name, license_number, license_type, license_status, instagram, distributor, number_of_locations, current_brands_carried, lead_source, ownership_status, account_submitted_by, account_submitted_at, ownership_verified_by, ownership_verified_at, ownership_notes, commission_eligible, commission_rate, commission_start_date, commission_expiration_date")
      .eq("id", customerId)
      .single(),
    admin.from("retail_opportunities").select("*").eq("customer_id", customerId).order("updated_at", { ascending: false }),
    admin.from("retail_samples").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }),
    admin.from("retail_sales_orders").select("*").eq("customer_id", customerId).order("order_date", { ascending: false }),
  ]);

  const error = [customerRes, opportunityRes, sampleRes, orderRes].find((result) => result.error)?.error;
  if (error) throw new Error(error.message);

  const customer = customerRes.data as GenericRow;
  const orders = (orderRes.data || []) as GenericRow[];
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).getTime();
  const thisMonthOrders = orders.filter((order) => {
    const orderDate = Date.parse(String(order.order_date || ""));
    return Number.isFinite(orderDate) && orderDate >= monthStart && orderDate < monthEnd;
  });

  return {
    account: {
      legalBusinessName: text(customer.legal_business_name),
      dbaName: text(customer.dba_name),
      licenseNumber: text(customer.license_number),
      licenseType: text(customer.license_type),
      licenseStatus: text(customer.license_status),
      instagram: text(customer.instagram),
      distributor: text(customer.distributor),
      numberOfLocations: Math.max(1, number(customer.number_of_locations, 1)),
      currentBrandsCarried: Array.isArray(customer.current_brands_carried)
        ? customer.current_brands_carried.map((value) => String(value || "")).filter(Boolean)
        : [],
      leadSource: text(customer.lead_source),
      ownershipStatus: text(customer.ownership_status) || "unverified",
      accountSubmittedBy: text(customer.account_submitted_by),
      accountSubmittedAt: text(customer.account_submitted_at),
      ownershipVerifiedBy: text(customer.ownership_verified_by),
      ownershipVerifiedAt: text(customer.ownership_verified_at),
      ownershipNotes: text(customer.ownership_notes),
      commissionEligible: customer.commission_eligible === true,
      commissionRate: number(customer.commission_rate, 0.05),
      commissionStartDate: text(customer.commission_start_date),
      commissionExpirationDate: text(customer.commission_expiration_date),
    },
    opportunities: (opportunityRes.data || []) as GenericRow[],
    samples: (sampleRes.data || []) as GenericRow[],
    orders,
    commission: {
      commissionableSalesThisMonth: thisMonthOrders.reduce((sum, order) => sum + number(order.commissionable_sales), 0),
      estimatedCommissionThisMonth: thisMonthOrders.reduce((sum, order) => sum + number(order.estimated_commission), 0),
      approvedUnpaidCommission: orders
        .filter((order) => String(order.commission_status) === "approved")
        .reduce((sum, order) => sum + number(order.estimated_commission), 0),
      paidCommission: orders
        .filter((order) => String(order.commission_status) === "paid")
        .reduce((sum, order) => sum + number(order.estimated_commission), 0),
    },
  };
}
