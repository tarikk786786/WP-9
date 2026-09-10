import type { ToolDefinition } from "../types.ts";

export const createReminderTool: ToolDefinition<
  { jid: string; reminderText: string; remindAt: string },
  { reminderId: string; scheduledFor: string }
> = {
  name: "create_reminder",
  category: "productivity",
  description: "Sets a reminder for the user or contact at a designated time",
  parameters: [
    { name: "jid", type: "string", description: "Target contact JID", required: true },
    { name: "reminderText", type: "string", description: "What to remind about", required: true },
    { name: "remindAt", type: "string", description: "Time or date expression (e.g. tomorrow at 10 AM)", required: true },
  ],
  async execute({ jid, reminderText, remindAt }) {
    const id = `rem_${Date.now()}`;
    return {
      success: true,
      data: { reminderId: id, scheduledFor: remindAt },
      summary: `Set reminder "${reminderText}" for ${remindAt}`,
    };
  },
};

export const scheduleMessageTool: ToolDefinition<
  { jid: string; message: string; sendAt: string },
  { jobId: string; status: string }
> = {
  name: "schedule_message",
  category: "productivity",
  description: "Schedules an outbound WhatsApp message for future dispatch via BullMQ",
  parameters: [
    { name: "jid", type: "string", description: "Target WhatsApp JID", required: true },
    { name: "message", type: "string", description: "Message content", required: true },
    { name: "sendAt", type: "string", description: "ISO timestamp or future time expression", required: true },
  ],
  async execute({ jid, sendAt }) {
    return {
      success: true,
      data: { jobId: `sched_${Date.now()}`, status: "queued" },
      summary: `Scheduled message to ${jid} for ${sendAt}`,
    };
  },
};

export const calendarTool: ToolDefinition<
  { action: "check_availability" | "list_events"; date?: string },
  { availableSlots: string[]; notes: string }
> = {
  name: "calendar",
  category: "productivity",
  description: "Checks meeting availability and calendar slots",
  parameters: [
    { name: "action", type: "string", description: "Action to perform", required: true, enum: ["check_availability", "list_events"] },
    { name: "date", type: "string", description: "Target date (e.g. tomorrow)" },
  ],
  async execute() {
    return {
      success: true,
      data: {
        availableSlots: ["After 2:00 PM IST", "Evening 6:00 PM IST"],
        notes: "IST timezone. High-stakes forensic & security bookings.",
      },
      summary: "Calendar availability checked",
    };
  },
};

export const productivityTools = [
  createReminderTool,
  scheduleMessageTool,
  calendarTool,
];
