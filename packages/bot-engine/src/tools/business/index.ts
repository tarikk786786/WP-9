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

export const businessTools = [
  customerLookupTool,
  orderLookupTool,
  productLookupTool,
  inventoryTool,
  supportTicketTool,
];
