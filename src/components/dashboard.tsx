"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { LocalBrain } from "@/components/local-brain";
import { ScanLogin } from "@/components/scan-login";
import type { DeskData } from "@/lib/load-desk";
import type { BotRules, InboxMessage, KeywordRule } from "@/lib/types";

function emptyRule(): KeywordRule {
  return {
    id: `rule_${Date.now()}`,
    keyword: "",
    reply: "",
    enabled: true,
  };
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${months[date.getUTCMonth()]} ${day} ${hours}:${minutes} UTC`;
}

export function Dashboard({ initial }: { initial: DeskData }) {
  const [rules, setRules] = useState<BotRules>(initial.rules);
  const [status] = useState(initial.status);
  const [inbox, setInbox] = useState<InboxMessage[]>(initial.inbox);
  const [fromName, setFromName] = useState("Amina");
  const [simText, setSimText] = useState("Hi, what are your hours?");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const skipAutoSave = useRef(true);

  useEffect(() => {
    if (skipAutoSave.current) {
      skipAutoSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      })
        .then((response) => response.json())
        .then((json: { rules?: BotRules }) => {
          if (json.rules) {
            setNotice("Voice, greetings, hours, keywords — is disk pe forever save ho gaye.");
          }
        })
        .catch(() => {
          // Manual Save still works if the auto-write misses.
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [rules]);

  function mergeInbox(incoming: InboxMessage[]) {
    if (!incoming.length) return;
    setInbox((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      for (const item of incoming) byId.set(item.id, item);
      return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async () => {
        const inboxRes = await fetch("/api/inbox", { cache: "no-store" });
        if (!inboxRes.ok) return;
        const inboxJson = (await inboxRes.json()) as { messages?: InboxMessage[] };
        mergeInbox(inboxJson.messages ?? []);
      })();
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  const webhookUrl = "/api/whatsapp/webhook";

  async function saveRules() {
    if (!rules) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });
      const json = (await response.json()) as { rules?: BotRules; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Could not save rules.");
      setRules(json.rules ?? rules);
      setNotice("Saved on this disk forever. Restart ke baad bhi yahi greetings aur voice.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function simulate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromName, text: simText }),
      });
      const json = (await response.json()) as {
        error?: string;
        message?: InboxMessage;
      };
      if (!response.ok) throw new Error(json.error ?? "Simulation failed.");
      if (json.message) {
        mergeInbox([json.message]);
      }
      setNotice(
        json.message?.reply
          ? "Reply ready — yeh usi engine se hai jo WhatsApp use karta hai."
          : (json.message?.skippedReason ?? "Reply skip ho gaya."),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyRulesJson() {
    if (!rules) return;
    await navigator.clipboard.writeText(JSON.stringify(rules));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_oklch(0.93_0.05_155),_transparent_42%),linear-gradient(180deg,_oklch(0.97_0.02_155),_oklch(0.99_0.01_155))]">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
              Main Tarik hoon · always live
            </p>
            <h1 className="font-heading mt-1 text-2xl font-semibold tracking-tight">
              Mera WhatsApp, meri awaaz
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Replies first person — main khud likh raha hoon, kisi ke behalf pe nahi.
              Facts{" "}
              <a className="underline" href="https://tarikislam.in" target="_blank" rel="noreferrer">
                tarikislam.in
              </a>{" "}
              se. Voice, language, hours, keywords — sab customize.
            </p>
          </div>
          <Badge variant={status.configured ? "default" : "secondary"} className="w-fit">
            {status.configured ? "Cloud API + local brain" : "Local brain ready"}
          </Badge>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.15fr_0.85fr]">
        <LocalBrain
          initial={{
            ...initial.live,
            profile: initial.live.profile ?? initial.profile,
          }}
        />
        <ScanLogin
          hostedOnVercel={initial.live.whatsapp.serverless}
          onInbox={mergeInbox}
        />

        {(notice || error) && (
          <div className="lg:col-span-2">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertTitle>Updated</AlertTitle>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Or use WhatsApp Cloud API</CardTitle>
            <CardDescription>
              Official Meta webhook. QR above is personal WhatsApp Web — keep
              that tab open until it says Linked.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6">
              <li>
                Create a Meta app at{" "}
                <a
                  className="underline"
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noreferrer"
                >
                  developers.facebook.com
                </a>{" "}
                and add the WhatsApp product.
              </li>
              <li>
                Use a WhatsApp Business phone number (test number works for first
                replies). Copy the phone number ID and a permanent access token.
              </li>
              <li>Set these Vercel environment variables, then redeploy.</li>
              <li>
                In Meta, set the callback URL to{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {webhookUrl}
                </code>{" "}
                and the verify token to the same value as{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  WHATSAPP_VERIFY_TOKEN
                </code>
                .
              </li>
            </ol>
            <div className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-2">
              <StatusRow ok={status.hasAccessToken} label="WHATSAPP_ACCESS_TOKEN" />
              <StatusRow ok={status.hasPhoneNumberId} label="WHATSAPP_PHONE_NUMBER_ID" />
              <StatusRow ok={status.hasVerifyToken} label="WHATSAPP_VERIFY_TOKEN" />
              <StatusRow ok={status.hasAppSecret} label="WHATSAPP_APP_SECRET" />
            </div>
            <p className="text-xs text-muted-foreground">
              Graph API {status.graphApiVersion}. App secret is optional locally and
              recommended in production so Meta signatures are checked.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Try a reply without Meta</CardTitle>
            <CardDescription>
              Pretend a customer wrote you. The same engine the webhook uses
              decides what to send back.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="fromName">Contact name</Label>
              <Input
                id="fromName"
                value={fromName}
                onChange={(event) => setFromName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="simText">Incoming message</Label>
              <Textarea
                id="simText"
                value={simText}
                onChange={(event) => setSimText(event.target.value)}
                rows={4}
              />
            </div>
            <Button onClick={simulate} disabled={busy}>
              {busy ? "Working…" : "Generate reply"}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <Tabs defaultValue="rules">
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Inbox and rules</CardTitle>
                  <CardDescription>
                    Main Tarik hoon. Voice, language, media, aur keywords yahan set karo.
                  </CardDescription>
                </div>
                <TabsList>
                  <TabsTrigger value="voice">Voice</TabsTrigger>
                  <TabsTrigger value="rules">Rules</TabsTrigger>
                  <TabsTrigger value="inbox">Inbox</TabsTrigger>
                </TabsList>
              </div>
            </CardHeader>
            <CardContent>
              <TabsContent value="voice" className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <select
                      className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
                      value={rules.language}
                      onChange={(event) =>
                        setRules({
                          ...rules,
                          language: event.target.value as BotRules["language"],
                        })
                      }
                    >
                      <option value="hinglish">Hinglish (soft)</option>
                      <option value="english">English (calm)</option>
                      <option value="hindi">Hindi (narm)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tone</Label>
                    <select
                      className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
                      value={rules.tone}
                      onChange={(event) =>
                        setRules({ ...rules, tone: event.target.value as BotRules["tone"] })
                      }
                    >
                      <option value="soft">Soft</option>
                      <option value="warm">Warm</option>
                      <option value="sharp">Short & clear</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Who gets a reply</Label>
                    <select
                      className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
                      value={rules.replyMode}
                      onChange={(event) =>
                        setRules({
                          ...rules,
                          replyMode: event.target.value as BotRules["replyMode"],
                        })
                      }
                    >
                      <option value="all">Every chat</option>
                      <option value="keywords">Keywords only</option>
                      <option value="greetings">Greetings only</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ToggleRow
                    title="Use contact’s first name"
                    hint="Amina, … jaise narm start."
                    checked={rules.includeName}
                    onChange={(checked) => setRules({ ...rules, includeName: checked })}
                  />
                  <ToggleRow
                    title="Local models"
                    hint="Ollama / Flan, phir meri Hinglish voice."
                    checked={rules.useLocalLlm}
                    onChange={(checked) => setRules({ ...rules, useLocalLlm: checked })}
                  />
                  <ToggleRow
                    title="Soft emoji"
                    hint="Ek chhota smile, zyada nahi."
                    checked={rules.emoji}
                    onChange={(checked) => setRules({ ...rules, emoji: checked })}
                  />
                  <ToggleRow
                    title="Typing indicator"
                    hint="Pehle composing, phir reply."
                    checked={rules.showTyping}
                    onChange={(checked) => setRules({ ...rules, showTyping: checked })}
                  />
                  <ToggleRow
                    title="Reply to photos / voice / files"
                    hint="Main dekh raha hoon, quietly."
                    checked={rules.replyToMedia}
                    onChange={(checked) => setRules({ ...rules, replyToMedia: checked })}
                  />
                  <ToggleRow
                    title="Reply in groups"
                    hint="Off by default — groups messy hote hain."
                    checked={rules.replyToGroups}
                    onChange={(checked) => setRules({ ...rules, replyToGroups: checked })}
                  />
                </div>
                <TextField
                  label="Signature (optional)"
                  value={rules.signature}
                  onChange={(value) => setRules({ ...rules, signature: value })}
                />
                <TextField
                  label="Extra facts I should say (one per line)"
                  value={rules.customFacts}
                  onChange={(value) => setRules({ ...rules, customFacts: value })}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setRules({
                        ...rules,
                        language: "hinglish",
                        tone: "soft",
                        emoji: false,
                      })
                    }
                  >
                    Preset: Soft Hinglish
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setRules({
                        ...rules,
                        language: "english",
                        tone: "warm",
                        emoji: false,
                      })
                    }
                  >
                    Preset: Warm English
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setRules({
                        ...rules,
                        language: "hindi",
                        tone: "soft",
                        emoji: true,
                      })
                    }
                  >
                    Preset: Narm Hindi
                  </Button>
                </div>
                <Button onClick={saveRules} disabled={busy}>
                  Save voice
                </Button>
              </TabsContent>

              <TabsContent value="rules" className="space-y-5">
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Auto-reply</p>
                    <p className="text-sm text-muted-foreground">
                      When off, incoming WhatsApp messages are logged and not answered.
                    </p>
                  </div>
                  <Switch
                    checked={rules.enabled}
                    onCheckedChange={(checked) =>
                      setRules({ ...rules, enabled: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Local LLM replies</p>
                    <p className="text-sm text-muted-foreground">
                      Use free local models first. If they are offline, keyword
                      and default rules still answer.
                    </p>
                  </div>
                  <Switch
                    checked={rules.useLocalLlm}
                    onCheckedChange={(checked) =>
                      setRules({ ...rules, useLocalLlm: checked })
                    }
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Desk name"
                    value={rules.botName}
                    onChange={(value) => setRules({ ...rules, botName: value })}
                  />
                  <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <p className="font-medium">Use first name</p>
                      <p className="text-sm text-muted-foreground">
                        Prefix replies with the contact’s name when Meta sends it.
                      </p>
                    </div>
                    <Switch
                      checked={rules.includeName}
                      onCheckedChange={(checked) =>
                        setRules({ ...rules, includeName: checked })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    label="Greeting reply"
                    value={rules.greetingReply}
                    onChange={(value) => setRules({ ...rules, greetingReply: value })}
                  />
                  <TextField
                    label="Default reply"
                    value={rules.defaultReply}
                    onChange={(value) => setRules({ ...rules, defaultReply: value })}
                  />
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Business hours</p>
                      <p className="text-sm text-muted-foreground">
                        Outside this window, only the after-hours message is sent.
                      </p>
                    </div>
                    <Switch
                      checked={rules.businessHoursEnabled}
                      onCheckedChange={(checked) =>
                        setRules({ ...rules, businessHoursEnabled: checked })
                      }
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field
                      label="Timezone"
                      value={rules.timezone}
                      onChange={(value) => setRules({ ...rules, timezone: value })}
                    />
                    <Field
                      label="Opens"
                      type="number"
                      value={String(rules.openHour)}
                      onChange={(value) =>
                        setRules({ ...rules, openHour: Number(value) || 0 })
                      }
                    />
                    <Field
                      label="Closes"
                      type="number"
                      value={String(rules.closeHour)}
                      onChange={(value) =>
                        setRules({ ...rules, closeHour: Number(value) || 0 })
                      }
                    />
                    <div className="sm:col-span-4">
                      <TextField
                        label="After-hours reply"
                        value={rules.afterHoursReply}
                        onChange={(value) =>
                          setRules({ ...rules, afterHoursReply: value })
                        }
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Keyword replies</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setRules({
                          ...rules,
                          keywordRules: [emptyRule(), ...rules.keywordRules],
                        })
                      }
                    >
                      Add keyword
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {rules.keywordRules.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No keyword rules yet. Add one such as “price” or “hours”.
                      </p>
                    ) : (
                      rules.keywordRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="grid gap-3 rounded-lg border p-3 md:grid-cols-[140px_1fr_auto]"
                        >
                          <Input
                            value={rule.keyword}
                            placeholder="keyword"
                            onChange={(event) =>
                              updateKeyword(setRules, rules, rule.id, {
                                keyword: event.target.value,
                              })
                            }
                          />
                          <Input
                            value={rule.reply}
                            placeholder="reply text"
                            onChange={(event) =>
                              updateKeyword(setRules, rules, rule.id, {
                                reply: event.target.value,
                              })
                            }
                          />
                          <div className="flex items-center justify-end gap-2">
                            <Switch
                              checked={rule.enabled}
                              onCheckedChange={(checked) =>
                                updateKeyword(setRules, rules, rule.id, {
                                  enabled: checked,
                                })
                              }
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setRules({
                                  ...rules,
                                  keywordRules: rules.keywordRules.filter(
                                    (item) => item.id !== rule.id,
                                  ),
                                })
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={saveRules} disabled={busy}>
                    Save rules
                  </Button>
                  <Button variant="outline" onClick={copyRulesJson}>
                    {copied ? "Copied" : "Copy REPLY_RULES_JSON"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="inbox">
                {inbox.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-12 text-center">
                    <p className="font-medium">No messages yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Run the simulator or wait for the first Cloud API webhook.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {inbox.map((message) => (
                      <li key={message.id} className="rounded-xl border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{message.fromName}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{message.source}</Badge>
                            {message.engine ? (
                              <Badge variant="outline">{message.engine}</Badge>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {formatTime(message.createdAt)}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-sm">{message.body}</p>
                        {message.reply ? (
                          <p className="mt-3 rounded-lg bg-primary/8 px-3 py-2 text-sm">
                            <span className="font-medium text-primary">Reply · </span>
                            {message.reply}
                          </p>
                        ) : (
                          <p className="mt-3 text-sm text-muted-foreground">
                            Not sent: {message.skippedReason}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </main>
    </div>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <code className="text-xs">{label}</code>
      <Badge variant={ok ? "default" : "outline"}>{ok ? "set" : "missing"}</Badge>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={value} rows={3} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ToggleRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function updateKeyword(
  setRules: (rules: BotRules) => void,
  rules: BotRules,
  id: string,
  patch: Partial<KeywordRule>,
) {
  setRules({
    ...rules,
    keywordRules: rules.keywordRules.map((rule) =>
      rule.id === id ? { ...rule, ...patch } : rule,
    ),
  });
}
