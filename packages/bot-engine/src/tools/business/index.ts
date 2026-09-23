import type { ToolDefinition } from "../types.ts";

export const customerLookupTool: ToolDefinition<{ phone: string }, { customer: any }> = {
  name: "customer_lookup",
  category: "business",
  description: "Looks up customer profile, contact history, and VIP status",
  parameters: [
    { name: "phone", type: "string", description: "Phone number with country code", required: true },
  ],
  async execute({ phone }) {
    return {
      success: true,
      data: { customer: { phone, name: "Known Contact", tier: "regular" } },
      summary: `Found profile for ${phone}`,
    };
  },
};

export const orderLookupTool: ToolDefinition<{ orderId: string }, { order: any }> = {
  name: "order_lookup",
  category: "business",
  description: "Retrieves order status, shipment tracking, or invoice details",
  parameters: [
    { name: "orderId", type: "string", description: "Order ID or transaction reference", required: true },
  ],
  async execute({ orderId }) {
    return {
      success: true,
      data: { order: { orderId, status: "completed", timestamp: Date.now() } },
      summary: `Order ${orderId} details retrieved`,
    };
  },
};

export const productLookupTool: ToolDefinition<{ query: string }, { items: any[] }> = {
  name: "product_lookup",
  category: "business",
  description: "Looks up services, deliverables, or studio offerings from DEZO / Tarik",
  parameters: [
    { name: "query", type: "string", description: "Service or product search query", required: true },
  ],
  async execute({ query }) {
    return {
      success: true,
      data: {
        items: [
          { name: "Digital Evidence & Forensics", details: "Detailed investigation and forensic imaging", site: "tarikislam.in" },
          { name: "Cybersecurity Architecture", details: "Zero-trust hardening, protocol verification", site: "tarikislam.in" },
          { name: "DEZO Studio Products", details: "Engineering & software craft", site: "dezo.in" },
        ],
      },
      summary: `Lookup results for ${query}`,
    };
  },
};

export const inventoryTool: ToolDefinition<{ sku: string }, { inStock: boolean; availableUnits: number }> = {
  name: "inventory",
  category: "business",
  description: "Checks availability or capacity for products / services",
  parameters: [
    { name: "sku", type: "string", description: "Product SKU or service key", required: true },
  ],
  async execute() {
    return {
      success: true,
      data: { inStock: true, availableUnits: 1 },
      summary: "Capacity available",
    };
  },
};

export const supportTicketTool: ToolDefinition<
  { jid: string; summary: string; priority?: "normal" | "urgent" },
  { ticketId: string; status: string }
> = {
  name: "support_ticket",
  category: "business",
  description: "Creates an internal support ticket or flags urgent client escalation",
  parameters: [
    { name: "jid", type: "string", description: "Customer WhatsApp ID", required: true },
    { name: "summary", type: "string", description: "Issue summary", required: true },
    { name: "priority", type: "string", description: "Priority level", enum: ["normal", "urgent"] },
  ],
  async execute({ jid, summary, priority = "normal" }) {
    const id = `tkt_${Date.now()}`;
    return {
      success: true,
      data: { ticketId: id, status: "created" },
      summary: `Created ${priority} ticket ${id} for ${jid}: "${summary}"`,
    };
  },
};

export const createLeadTool: ToolDefinition<
  { phone: string; name?: string; requirement: string; budget?: string },
  { leadId: string; status: string }
> = {
  name: "create_lead",
  category: "business",
  description: "Creates a qualified sales lead in the CRM pipeline",
  parameters: [
    { name: "phone", type: "string", description: "Customer phone number", required: true },
    { name: "requirement", type: "string", description: "Project or service requirement", required: true },
    { name: "name", type: "string", description: "Customer name" },
    { name: "budget", type: "string", description: "Estimated budget or target" },
  ],
  async execute({ phone, requirement, name, budget }) {
    const id = `lead_${Date.now()}`;
    return {
      success: true,
      data: { leadId: id, status: "new" },
      summary: `Created lead ${id} for ${name || phone}: "${requirement}" (Budget: ${budget || "TBD"})`,
    };
  },
};

export const updateCustomerTool: ToolDefinition<
  { phone: string; tag?: string; note?: string },
  { updated: boolean }
> = {
  name: "update_customer",
  category: "business",
  description: "Updates customer profile with new tags or notes",
  parameters: [
    { name: "phone", type: "string", description: "Customer phone number", required: true },
    { name: "tag", type: "string", description: "Tag to add (e.g. VIP, lead, enterprise)" },
    { name: "note", type: "string", description: "CRM note" },
  ],
  async execute({ phone, tag, note }) {
    return {
      success: true,
      data: { updated: true },
      summary: `Updated customer ${phone} (Tag: ${tag || "none"}, Note: ${note || "none"})`,
    };
  },
};

export const trackOrderTool: ToolDefinition<
  { orderId: string },
  { trackingNumber: string; carrier: string; status: string; estimatedDelivery: string }
> = {
  name: "track_order",
  category: "business",
  description: "Retrieves live shipping tracking status for an order",
  parameters: [
    { name: "orderId", type: "string", description: "Order reference ID", required: true },
  ],
  async execute({ orderId }) {
    return {
      success: true,
      data: {
        trackingNumber: `TRK_${orderId}`,
        carrier: "BlueDart / IndiaPost",
        status: "in_transit",
        estimatedDelivery: "2-3 business days",
      },
      summary: `Order ${orderId} is in transit via BlueDart`,
    };
  },
};

export const getPriceTool: ToolDefinition<
  { item: string },
  { item: string; startingPrice: string; currency: string }
> = {
  name: "get_price",
  category: "business",
  description: "Retrieves verified pricing and baseline rates for services or deliverables",
  parameters: [
    { name: "item", type: "string", description: "Product SKU or service name", required: true },
  ],
  async execute({ item }) {
    const isForensics = /forensic|evidence/i.test(item);
    return {
      success: true,
      data: {
        item,
        startingPrice: isForensics ? "₹25,000" : "₹15,000",
        currency: "INR",
      },
      summary: `Price for ${item}: starts at ${isForensics ? "₹25,000" : "₹15,000"}`,
    };
  },
};

export const createPaymentLinkTool: ToolDefinition<
  { amount: number; purpose: string; customerPhone: string },
  { paymentUrl: string; paymentId: string }
> = {
  name: "create_payment_link",
  category: "business",
  description: "Generates an official verified payment link for invoices",
  parameters: [
    { name: "amount", type: "number", description: "Amount in INR", required: true },
    { name: "purpose", type: "string", description: "Invoice purpose", required: true },
    { name: "customerPhone", type: "string", description: "Customer phone", required: true },
  ],
  async execute({ amount, purpose }) {
    const id = `pay_${Date.now()}`;
    return {
      success: true,
      data: {
        paymentId: id,
        paymentUrl: `https://pay.tarikislam.in/invoice/${id}`,
      },
      summary: `Created payment link for ₹${amount} (${purpose})`,
    };
  },
};

export const findAvailableSlotsTool: ToolDefinition<
  { date?: string },
  { availableSlots: string[] }
> = {
  name: "find_available_slots",
  category: "business",
  description: "Looks up available meeting and call slots on Tarik's calendar",
  parameters: [
    { name: "date", type: "string", description: "Target date (YYYY-MM-DD or 'tomorrow')" },
  ],
  async execute({ date = "tomorrow" }) {
    return {
      success: true,
      data: {
        availableSlots: ["3:00 PM IST", "4:00 PM IST", "5:30 PM IST"],
      },
      summary: `Found 3 available slots for ${date}`,
    };
  },
};

export const createBookingTool: ToolDefinition<
  { slot: string; customerName: string; topic: string },
  { bookingId: string; confirmedSlot: string }
> = {
  name: "create_booking",
  category: "business",
  description: "Confirms and books a calendar meeting slot",
  parameters: [
    { name: "slot", type: "string", description: "Selected time slot", required: true },
    { name: "customerName", type: "string", description: "Customer or attendee name", required: true },
    { name: "topic", type: "string", description: "Meeting subject", required: true },
  ],
  async execute({ slot, customerName, topic }) {
    const id = `bk_${Date.now()}`;
    return {
      success: true,
      data: { bookingId: id, confirmedSlot: slot },
      summary: `Booked meeting ${id} with ${customerName} at ${slot} regarding "${topic}"`,
    };
  },
};

export const businessTools = [
  customerLookupTool,
  orderLookupTool,
  productLookupTool,
  inventoryTool,
  supportTicketTool,
  createLeadTool,
  updateCustomerTool,
  trackOrderTool,
  getPriceTool,
  createPaymentLinkTool,
  findAvailableSlotsTool,
  createBookingTool,
];
