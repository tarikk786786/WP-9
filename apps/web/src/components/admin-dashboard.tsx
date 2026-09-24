"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScanLogin } from "@/components/scan-login";
import { SystemStatus } from "@/components/system-status";
import type { AutomationRule, BotSettings, Faq } from "@bot/shared";
import { defaultBotSettings } from "@bot/shared";

type InboxPayload = {
  messages?: Array<{
    id: string;
    chat_id?: string;
    conversation_id: string;
    direction: string;
    text: string;
    created_at: string;
    whatsapp_message_id: string;
    intent?: string | null;
    message_type?: string;
  }>;
  conversations?: Array<{ id: string; chat_id: string; status: string; last_message_at: string }>;
  customers?: Array<{ id: string; whatsapp_number: string; name: string; language: string; last_seen_at: string }>;
};

type SettingsPayload = {
  settings?: BotSettings;
  rules?: AutomationRule[];
  faqs?: Faq[];
  knowledge?: Array<{ id: string; title: string; content: string; enabled: boolean }>;
};

type StatusPayload = {
  status?: string;
  health?: {
    worker?: string;
    service?: string;
    uptimeMs?: number;
    whatsapp?: {
      status?: string;
      phase?: string;
      connected?: boolean;
      phone?: string | null;
      error?: string | null;
    };
  };
  analytics?: Record<string, number>;
  error?: string;
};

function formatPhone(chatId: string): string {
  const digits = chatId.replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, "").replace(/@g\.us$/, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return digits || chatId;
}

function renderAgentBadge(intent?: string | null, text?: string) {
  const lower = (intent || text || "").toLowerCase();
  if (lower.includes("dazy") || lower.includes("love")) {
    return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30">❤️ DAZy Love</span>;
  }
  if (lower.includes("sales") || lower.includes("price") || lower.includes("lead")) {
    return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">💼 Sales</span>;
  }
  if (lower.includes("support") || lower.includes("troubleshoot") || lower.includes("ticket")) {
    return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">🛠️ Support</span>;
  }
  if (lower.includes("billing") || lower.includes("payment") || lower.includes("invoice")) {
    return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">💳 Billing</span>;
  }
  if (lower.includes("booking") || lower.includes("slot") || lower.includes("appointment")) {
    return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">📅 Booking</span>;
  }
  if (lower.includes("human") || lower.includes("escalat")) {
    return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">👤 Human Rep</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-zinc-500/20 text-zinc-300 border border-zinc-500/30">🤖 AI Bot</span>;
}

export function AdminDashboard({ view }: { view: "dashboard" | "conversations" | "customers" | "faqs" | "rules" | "settings" | "logs" }) {
  const [status, setStatus] = useState<StatusPayload>({});
  const [inbox, setInbox] = useState<InboxPayload>({});
  const [settingsPack, setSettingsPack] = useState<SettingsPayload>({});
  const [logs, setLogs] = useState<Array<{ id: string; level: string; source: string; message: string; created_at: string }>>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [reply, setReply] = useState({ chatId: "", message: "" });
  const [knowledge, setKnowledge] = useState({ title: "", content: "" });

  async function refresh() {
    const [st, ib, se, lg] = await Promise.all([
      fetch("/api/worker/status").then((r) => r.json()).catch(() => ({ error: "Worker offline" })),
      fetch("/api/admin/inbox").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/settings").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/logs").then((r) => r.json()).catch(() => ({ logs: [] })),
    ]);
    setStatus(st);
    setInbox(ib);
    setSettingsPack(se);
    setLogs(lg.logs ?? []);
  }

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, 8000);
    const boot = setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(boot);
    };
  }, []);

  const settings = settingsPack.settings ?? defaultBotSettings();
  const rules = settingsPack.rules ?? [];
  const faqs = settingsPack.faqs ?? [];
  const wa = status.health?.whatsapp;
  const stats = status.analytics ?? {};

  const conversations = useMemo(() => {
    const q = filter.toLowerCase();
    return (inbox.conversations ?? []).filter((c) => {
      const matchesQuery = !q || c.chat_id.toLowerCase().includes(q) || c.status.includes(q);
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [inbox.conversations, filter, statusFilter]);

  const activeChatId = selectedChatId || (conversations[0]?.chat_id ?? null);
  const activeConversation = useMemo(() => {
    return (inbox.conversations ?? []).find((c) => c.chat_id === activeChatId);
  }, [inbox.conversations, activeChatId]);

  const activeCustomer = useMemo(() => {
    if (!activeChatId) return null;
    const cleanNumber = activeChatId.replace(/\D/g, "");
    return (inbox.customers ?? []).find((c) => c.whatsapp_number.includes(cleanNumber) || cleanNumber.includes(c.whatsapp_number));
  }, [inbox.customers, activeChatId]);

  const activeMessages = useMemo(() => {
    if (!activeChatId) return [];
    return (inbox.messages ?? [])
      .filter((m) => {
        if (m.chat_id) return m.chat_id === activeChatId;
        if (activeConversation && m.conversation_id === activeConversation.id) return true;
        return false;
      })
      .slice()
      .reverse();
  }, [inbox.messages, activeChatId, activeConversation]);

  async function savePack(next: SettingsPayload) {
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: next.settings ?? settings,
        rules: next.rules ?? rules,
        faqs: next.faqs ?? faqs,
      }),
    });
    if (response.ok) {
      setNotice("Saved on the worker.");
      setSettingsPack({ settings: next.settings ?? settings, rules: next.rules ?? rules, faqs: next.faqs ?? faqs });
    } else {
      setNotice("Save failed — is the worker running?");
    }
  }

  async function sendReply(targetChatId?: string, textToSend?: string) {
    const chat = targetChatId || reply.chatId || activeChatId;
    const text = textToSend || reply.message;
    if (!chat || !text.trim()) return;

    const response = await fetch("/api/worker/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: chat, message: text }),
    });
    if (response.ok) {
      setNotice("Message queued on the worker.");
      setReply({ ...reply, message: "" });
      await refresh();
    } else {
      setNotice("Send failed. Link WhatsApp first.");
    }
  }

  async function setStatusFor(id: string, next: string) {
    await fetch("/api/admin/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    await refresh();
  }

  const quickTemplates = [
    "Hello! Boliye, main kis tarah madad kar sakta hoon?",
    "Namaste! Boliye, main kaise help kar sakta hoon?",
    "Theek hai, main manually check karke aapse baat karta hoon. Thoda waqt dijiye.",
    "Pricing project ke scope aur technical requirements pe depend karti hai. Thoda detail share kijiye.",
    "Sure! Please share your requirements and timeline so we can get started.",
  ];

  return (
    <div className="space-y-6">
      {notice ? (
        <div className="flex items-center justify-between p-3 rounded-lg border border-primary/30 bg-primary/10 text-sm">
          <span>{notice}</span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setNotice(null)}>Dismiss</Button>
        </div>
      ) : null}

      {view === "dashboard" ? (
        <>
          <SystemStatus />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              title="Worker"
              value={status.error ? "offline" : (status.status === "ready" || status.status === "online" || status.health?.service) ? "online" : "offline"}
            />
            <Stat
              title="WhatsApp"
              value={
                wa?.status === "CONNECTED" || wa?.connected
                  ? `linked ${wa?.phone ?? ""}`.trim()
                  : wa?.phase || wa?.status || "awaiting scan"
              }
            />
            <Stat title="Customers" value={String(stats.customers ?? inbox.customers?.length ?? 0)} />
            <Stat title="AI replies" value={String(stats.aiReplies ?? 0)} />
            <Stat title="Conversations" value={String(stats.conversations ?? inbox.conversations?.length ?? 0)} />
            <Stat title="Inbound" value={String(stats.messagesIn ?? 0)} />
            <Stat title="Outbound" value={String(stats.messagesOut ?? 0)} />
            <Stat title="Specialist Agents" value="5 Active" />
          </div>
          {wa?.error ? <p className="text-sm text-destructive">{wa.error}</p> : null}
          <ScanLogin />
        </>
      ) : null}

      {view === "conversations" ? (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* Left Column: Conversation Thread Selector */}
          <Card className="flex flex-col h-[750px]">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Conversations</CardTitle>
                <Badge variant="secondary" className="text-xs">{conversations.length} threads</Badge>
              </div>
              <CardDescription>Live WhatsApp user contacts</CardDescription>
              <div className="space-y-2 pt-2">
                <Input
                  placeholder="Search phone or keyword..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="h-8 text-xs"
                />
                <div className="flex flex-wrap gap-1">
                  {(["all", "bot", "waiting_human", "human", "closed"] as const).map((tab) => (
                    <Button
                      key={tab}
                      size="sm"
                      variant={statusFilter === tab ? "default" : "outline"}
                      className="h-6 px-2 text-[11px] capitalize"
                      onClick={() => setStatusFilter(tab)}
                    >
                      {tab.replace("_", " ")}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto divide-y">
              {conversations.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No conversations match filter. Messages appear automatically as users text your WhatsApp.
                </div>
              ) : null}
              {conversations.map((c) => {
                const isSelected = c.chat_id === activeChatId;
                const formatted = formatPhone(c.chat_id);
                const lastMsg = (inbox.messages ?? []).find(
                  (m) => m.chat_id === c.chat_id || m.conversation_id === c.id
                );
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedChatId(c.chat_id);
                      setReply({ ...reply, chatId: c.chat_id });
                    }}
                    className={`p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                      isSelected ? "bg-muted border-l-4 border-primary" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{formatted}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {lastMsg ? (
                            <>
                              <span className="font-semibold">{lastMsg.direction === "out" ? "You: " : ""}</span>
                              {lastMsg.text}
                            </>
                          ) : (
                            c.chat_id
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                        </span>
                        <Badge
                          variant={
                            c.status === "waiting_human"
                              ? "destructive"
                              : c.status === "human"
                              ? "default"
                              : "secondary"
                          }
                          className="text-[10px] px-1.5 py-0 h-4 uppercase"
                        >
                          {c.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Right Column: Active Conversation Chat Studio */}
          <Card className="flex flex-col h-[750px]">
            {activeChatId ? (
              <>
                {/* Active Chat Header */}
                <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-600/20 text-emerald-400 font-bold flex items-center justify-center text-sm border border-emerald-500/30">
                      {(activeCustomer?.name || activeChatId).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        {activeCustomer?.name || formatPhone(activeChatId)}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {activeChatId} · Mode: <span className="font-medium capitalize text-foreground">{activeConversation?.status || "bot"}</span>
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => activeConversation && void setStatusFor(activeConversation.id, "human")}
                    >
                      👤 Human
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => activeConversation && void setStatusFor(activeConversation.id, "bot")}
                    >
                      🤖 AI Bot
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => activeConversation && void setStatusFor(activeConversation.id, "closed")}
                    >
                      Close
                    </Button>
                  </div>
                </CardHeader>

                {/* Message Bubble Stream */}
                <CardContent className="flex-1 p-4 overflow-y-auto space-y-3 bg-muted/20">
                  {activeMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      No message history found for this contact yet.
                    </div>
                  ) : null}
                  {activeMessages.map((m) => {
                    const isOutbound = m.direction === "out";
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-sm text-sm ${
                            isOutbound
                              ? "bg-emerald-600 text-white rounded-br-xs"
                              : "bg-card border rounded-bl-xs text-foreground"
                          }`}
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                          <div className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] ${
                            isOutbound ? "text-emerald-100" : "text-muted-foreground"
                          }`}>
                            {isOutbound && renderAgentBadge(m.intent, m.text)}
                            <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {isOutbound ? <span>✓✓</span> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>

                {/* Quick Templates & Reply Box */}
                <div className="p-3 border-t bg-card space-y-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    <span className="text-[11px] font-medium text-muted-foreground shrink-0">Quick reply:</span>
                    {quickTemplates.map((tpl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => void sendReply(activeChatId, tpl)}
                        className="truncate max-w-[200px] text-[11px] border rounded-full px-2.5 py-0.5 bg-muted/50 hover:bg-muted text-foreground transition-colors shrink-0"
                      >
                        {tpl}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder={`Reply as Tarik to ${formatPhone(activeChatId)}... (Enter to send)`}
                      value={reply.message}
                      onChange={(e) => setReply({ ...reply, chatId: activeChatId, message: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendReply(activeChatId);
                        }
                      }}
                      className="min-h-[44px] max-h-32 text-sm resize-none"
                      rows={1}
                    />
                    <Button
                      onClick={() => void sendReply(activeChatId)}
                      className="self-end bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Send
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center p-8 text-center text-muted-foreground">
                Select a conversation thread on the left to start live messaging or review AI responses.
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {view === "customers" ? (
        <Card>
          <CardHeader>
            <CardTitle>Customers</CardTitle>
            <CardDescription>WhatsApp numbers seen by the worker.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {(inbox.customers ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No customers stored yet.</p> : null}
            {(inbox.customers ?? []).map((c) => (
              <div key={c.id} className="border rounded-lg p-3">
                <p className="font-medium">{c.name || c.whatsapp_number}</p>
                <p className="text-sm text-muted-foreground">{c.whatsapp_number} · {c.language} · last {c.last_seen_at}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {view === "faqs" ? (
        <Card>
          <CardHeader>
            <CardTitle>FAQs</CardTitle>
            <CardDescription>Keyword answers before AI runs.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button
              variant="outline"
              onClick={() =>
                void savePack({
                  faqs: [...faqs, { id: `faq_${Date.now()}`, question: "New question", answer: "Answer", keywords: [], category: "general", priority: 50, enabled: true }],
                })
              }
            >
              Add FAQ
            </Button>
            {faqs.map((faq, index) => (
              <div key={faq.id} className="grid gap-2 border rounded-lg p-3">
                <Input value={faq.question} onChange={(e) => {
                  const next = faqs.slice();
                  next[index] = { ...faq, question: e.target.value };
                  setSettingsPack({ ...settingsPack, faqs: next });
                }} />
                <Textarea value={faq.answer} onChange={(e) => {
                  const next = faqs.slice();
                  next[index] = { ...faq, answer: e.target.value };
                  setSettingsPack({ ...settingsPack, faqs: next });
                }} />
                <Input value={faq.keywords.join(", ")} onChange={(e) => {
                  const next = faqs.slice();
                  next[index] = { ...faq, keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) };
                  setSettingsPack({ ...settingsPack, faqs: next });
                }} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void savePack({ faqs })}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => void savePack({ faqs: faqs.filter((f) => f.id !== faq.id) })}>Delete</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {view === "rules" ? (
        <Card>
          <CardHeader>
            <CardTitle>Automation rules</CardTitle>
            <CardDescription>Exact, contains, keyword, or safe regex. Lower priority number wins.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button
              variant="outline"
              onClick={() =>
                void savePack({
                  rules: [...rules, { id: `rule_${Date.now()}`, name: "New rule", triggerType: "keyword", triggerValue: "", response: "", priority: 40, enabled: true }],
                })
              }
            >
              Add rule
            </Button>
            {rules.map((rule, index) => (
              <div key={rule.id} className="grid gap-2 border rounded-lg p-3">
                <Input value={rule.name} onChange={(e) => {
                  const next = rules.slice();
                  next[index] = { ...rule, name: e.target.value };
                  setSettingsPack({ ...settingsPack, rules: next });
                }} />
                <div className="grid sm:grid-cols-3 gap-2">
                  <Input value={rule.triggerType} onChange={(e) => {
                    const next = rules.slice();
                    next[index] = { ...rule, triggerType: e.target.value as AutomationRule["triggerType"] };
                    setSettingsPack({ ...settingsPack, rules: next });
                  }} />
                  <Input value={rule.triggerValue} onChange={(e) => {
                    const next = rules.slice();
                    next[index] = { ...rule, triggerValue: e.target.value };
                    setSettingsPack({ ...settingsPack, rules: next });
                  }} />
                  <Input type="number" value={rule.priority} onChange={(e) => {
                    const next = rules.slice();
                    next[index] = { ...rule, priority: Number(e.target.value) };
                    setSettingsPack({ ...settingsPack, rules: next });
                  }} />
                </div>
                <Textarea value={rule.response} onChange={(e) => {
                  const next = rules.slice();
                  next[index] = { ...rule, response: e.target.value };
                  setSettingsPack({ ...settingsPack, rules: next });
                }} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void savePack({ rules })}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => void savePack({ rules: rules.filter((r) => r.id !== rule.id) })}>Delete</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {view === "settings" ? (
        <Card>
          <CardHeader>
            <CardTitle>Bot settings</CardTitle>
            <CardDescription>Enable/disable the bot, AI, FAQs, hours, and knowledge.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Toggle label="Bot enabled" checked={settings.enabled} onChange={(enabled) => void savePack({ settings: { ...settings, enabled } })} />
            <Toggle label="AI enabled" checked={settings.aiEnabled} onChange={(aiEnabled) => void savePack({ settings: { ...settings, aiEnabled } })} />
            <Toggle label="FAQ enabled" checked={settings.faqEnabled} onChange={(faqEnabled) => void savePack({ settings: { ...settings, faqEnabled } })} />
            <Toggle label="Welcome enabled" checked={settings.welcomeEnabled} onChange={(welcomeEnabled) => void savePack({ settings: { ...settings, welcomeEnabled } })} />
            <Toggle label="Business hours" checked={settings.businessHours.enabled} onChange={(enabled) => void savePack({ settings: { ...settings, businessHours: { ...settings.businessHours, enabled } } })} />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Timezone" value={settings.timezone} onChange={(timezone) => setSettingsPack({ ...settingsPack, settings: { ...settings, timezone } })} />
              <Field label="Open" value={settings.businessHours.open} onChange={(open) => setSettingsPack({ ...settingsPack, settings: { ...settings, businessHours: { ...settings.businessHours, open } } })} />
              <Field label="Close" value={settings.businessHours.close} onChange={(close) => setSettingsPack({ ...settingsPack, settings: { ...settings, businessHours: { ...settings.businessHours, close } } })} />
              <Field label="Default language" value={settings.defaultLanguage} onChange={(defaultLanguage) => setSettingsPack({ ...settingsPack, settings: { ...settings, defaultLanguage: defaultLanguage as BotSettings["defaultLanguage"] } })} />
            </div>
            <Label>Welcome</Label>
            <Textarea value={settings.welcomeMessage} onChange={(e) => setSettingsPack({ ...settingsPack, settings: { ...settings, welcomeMessage: e.target.value } })} />
            <Label>Fallback</Label>
            <Textarea value={settings.fallbackMessage} onChange={(e) => setSettingsPack({ ...settingsPack, settings: { ...settings, fallbackMessage: e.target.value } })} />
            <Label>Human handoff</Label>
            <Textarea value={settings.humanHandoffMessage} onChange={(e) => setSettingsPack({ ...settingsPack, settings: { ...settings, humanHandoffMessage: e.target.value } })} />
            <Label>After hours</Label>
            <Textarea value={settings.businessHours.afterHoursMessage} onChange={(e) => setSettingsPack({ ...settingsPack, settings: { ...settings, businessHours: { ...settings.businessHours, afterHoursMessage: e.target.value } } })} />
            <Button onClick={() => void savePack({ settings })}>Save settings</Button>
            <div className="grid gap-2 border-t pt-4">
              <p className="font-medium">Knowledge base</p>
              <Input placeholder="Title" value={knowledge.title} onChange={(e) => setKnowledge({ ...knowledge, title: e.target.value })} />
              <Textarea placeholder="Content the AI may quote" value={knowledge.content} onChange={(e) => setKnowledge({ ...knowledge, content: e.target.value })} />
              <Button
                variant="outline"
                onClick={async () => {
                  await fetch("/api/admin/knowledge", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(knowledge),
                  });
                  setKnowledge({ title: "", content: "" });
                  setNotice("Knowledge stored.");
                }}
              >
                Add document
              </Button>
              {(settingsPack.knowledge ?? []).map((doc) => (
                <p key={doc.id} className="text-sm"><span className="font-medium">{doc.title}</span> — {doc.content.slice(0, 120)}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {view === "logs" ? (
        <Card>
          <CardHeader>
            <CardTitle>Logs</CardTitle>
            <CardDescription>Worker and processing events. Secrets are never written here.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {logs.length === 0 ? <p className="text-sm text-muted-foreground">No events yet.</p> : null}
            {logs.map((log) => (
              <p key={log.id} className="text-sm font-mono border-b pb-2">
                {log.created_at} [{log.level}] {log.source}: {log.message}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-lg">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
