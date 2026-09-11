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
  messages?: Array<{ id: string; chat_id?: string; conversation_id: string; direction: string; text: string; created_at: string; whatsapp_message_id: string }>;
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
  health?: { worker?: string; uptimeMs?: number; whatsapp?: { phase?: string; connected?: boolean; phone?: string | null; error?: string | null } };
  analytics?: Record<string, number>;
  error?: string;
};

export function AdminDashboard({ view }: { view: "dashboard" | "conversations" | "customers" | "faqs" | "rules" | "settings" | "logs" }) {
  const [status, setStatus] = useState<StatusPayload>({});
  const [inbox, setInbox] = useState<InboxPayload>({});
  const [settingsPack, setSettingsPack] = useState<SettingsPayload>({});
  const [logs, setLogs] = useState<Array<{ id: string; level: string; source: string; message: string; created_at: string }>>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
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
    return (inbox.conversations ?? []).filter((c) => !q || c.chat_id.toLowerCase().includes(q) || c.status.includes(q));
  }, [inbox.conversations, filter]);

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

  async function sendReply() {
    const response = await fetch("/api/worker/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reply),
    });
    setNotice(response.ok ? "Message queued on the worker." : "Send failed. Link WhatsApp first.");
  }

  async function setStatusFor(id: string, next: string) {
    await fetch("/api/admin/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    await refresh();
  }

  return (
    <div className="grid gap-4">
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {view === "dashboard" ? (
        <>
          <SystemStatus />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat title="Worker" value={status.error ? "offline" : status.health?.worker ?? "…"} />
            <Stat title="WhatsApp" value={wa?.connected ? `linked ${wa.phone ?? ""}` : wa?.phase ?? "unknown"} />
            <Stat title="Customers" value={String(stats.customers ?? inbox.customers?.length ?? 0)} />
            <Stat title="AI replies" value={String(stats.aiReplies ?? 0)} />
            <Stat title="Conversations" value={String(stats.conversations ?? inbox.conversations?.length ?? 0)} />
            <Stat title="Inbound" value={String(stats.messagesIn ?? 0)} />
            <Stat title="Outbound" value={String(stats.messagesOut ?? 0)} />
            <Stat title="Handoffs" value={String(stats.handoffs ?? 0)} />
          </div>
          {wa?.error ? <p className="text-sm text-destructive">{wa.error}</p> : null}
          <ScanLogin />
        </>
      ) : null}

      {view === "conversations" ? (
        <Card>
          <CardHeader>
            <CardTitle>Conversations</CardTitle>
            <CardDescription>Search, reply, hand off, or return a thread to the bot.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Input placeholder="Filter chat id or status" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input placeholder="chatId (e.g. 9198…@s.whatsapp.net)" value={reply.chatId} onChange={(e) => setReply({ ...reply, chatId: e.target.value })} />
              <Input placeholder="Reply as you" value={reply.message} onChange={(e) => setReply({ ...reply, message: e.target.value })} />
              <Button onClick={() => void sendReply()}>Send</Button>
            </div>
            <div className="grid gap-2">
              {conversations.length === 0 ? <p className="text-sm text-muted-foreground">No conversations yet. Incoming WhatsApp messages appear after the worker is linked.</p> : null}
              {conversations.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 border rounded-lg p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{c.chat_id}</p>
                    <p className="text-xs text-muted-foreground">{c.last_message_at}</p>
                  </div>
                  <Badge variant="secondary">{c.status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => { setReply({ ...reply, chatId: c.chat_id }); void setStatusFor(c.id, "human"); }}>Human</Button>
                  <Button size="sm" variant="outline" onClick={() => void setStatusFor(c.id, "bot")}>Bot</Button>
                  <Button size="sm" variant="ghost" onClick={() => void setStatusFor(c.id, "closed")}>Close</Button>
                </div>
              ))}
            </div>
            <div className="grid gap-2 max-h-80 overflow-auto">
              {(inbox.messages ?? []).map((m) => (
                <p key={m.id} className="text-sm border-b pb-2">
                  <span className="text-muted-foreground">{m.direction}</span> {m.text}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
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
