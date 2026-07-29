import { createAdminClient } from "@/lib/supabase/admin";
import { NAMELESS_WORKSPACE_KEY } from "@/lib/namelessWorkspace";

export type DuplicateAccountInput = {
  storeName: string | null;
  legalName: string | null;
  licenseNumber: string | null;
  address: string | null;
  buyerEmail: string | null;
  phone: string | null;
};

export type DuplicateAccountMatch = {
  id: string;
  storeName: string;
  legalName: string | null;
  licenseNumber: string | null;
  city: string | null;
  reasons: string[];
};

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function normalizedAddress(row: Record<string, unknown>) {
  return normalizeText(
    [row.address_1, row.address_2, row.city, row.state, row.postal_code]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ")
  );
}

export async function findLikelyDuplicateRetailAccounts(input: DuplicateAccountInput): Promise<DuplicateAccountMatch[]> {
  const admin = createAdminClient();
  const [{ data: customers, error: customerError }, { data: contacts, error: contactError }] = await Promise.all([
    admin
      .from("customers")
      .select("id, workspace_key, company_name, dba_name, legal_business_name, license_number, address_1, address_2, city, state, postal_code, main_phone, primary_contact_email")
      .limit(5000),
    admin.from("customer_contacts").select("customer_id, email, phone").limit(10000),
  ]);

  if (customerError) throw new Error(customerError.message);
  if (contactError) throw new Error(contactError.message);

  const contactsByCustomer = new Map<string, Array<Record<string, unknown>>>();
  for (const contact of (contacts || []) as Array<Record<string, unknown>>) {
    const customerId = String(contact.customer_id || "").trim();
    if (!customerId) continue;
    const list = contactsByCustomer.get(customerId) || [];
    list.push(contact);
    contactsByCustomer.set(customerId, list);
  }

  const targetStore = normalizeText(input.storeName);
  const targetLegal = normalizeText(input.legalName);
  const targetLicense = normalizeText(input.licenseNumber);
  const targetAddress = normalizeText(input.address);
  const targetEmail = normalizeText(input.buyerEmail);
  const targetPhone = normalizePhone(input.phone);

  return ((customers || []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const workspaceKey = normalizeText(String(row.workspace_key || ""));
      return !workspaceKey || workspaceKey === NAMELESS_WORKSPACE_KEY;
    })
    .map((row): DuplicateAccountMatch | null => {
      const id = String(row.id || "").trim();
      if (!id) return null;
      const reasons: string[] = [];
      const store = normalizeText(String(row.dba_name || row.company_name || ""));
      const legal = normalizeText(String(row.legal_business_name || ""));
      const license = normalizeText(String(row.license_number || ""));
      const address = normalizedAddress(row);
      const emails = [
        normalizeText(String(row.primary_contact_email || "")),
        ...(contactsByCustomer.get(id) || []).map((contact) => normalizeText(String(contact.email || ""))),
      ].filter(Boolean);
      const phones = [
        normalizePhone(String(row.main_phone || "")),
        ...(contactsByCustomer.get(id) || []).map((contact) => normalizePhone(String(contact.phone || ""))),
      ].filter(Boolean);

      if (targetStore && store === targetStore) reasons.push("Store name");
      if (targetLegal && legal === targetLegal) reasons.push("Legal name");
      if (targetLicense && license === targetLicense) reasons.push("License number");
      if (targetAddress && address && (address === targetAddress || address.includes(targetAddress) || targetAddress.includes(address))) {
        reasons.push("Address");
      }
      if (targetEmail && emails.includes(targetEmail)) reasons.push("Buyer email");
      if (targetPhone && phones.includes(targetPhone)) reasons.push("Phone number");
      if (reasons.length === 0) return null;

      return {
        id,
        storeName: String(row.dba_name || row.company_name || "Unnamed account"),
        legalName: String(row.legal_business_name || "").trim() || null,
        licenseNumber: String(row.license_number || "").trim() || null,
        city: String(row.city || "").trim() || null,
        reasons,
      };
    })
    .filter((match): match is DuplicateAccountMatch => Boolean(match))
    .sort((left, right) => right.reasons.length - left.reasons.length)
    .slice(0, 10);
}
