# Relay — always-live local LLM WhatsApp replies

Relay answers WhatsApp for you with **free local models** and a safety layer.

1. **Login by scan** — QR-link the WhatsApp on your phone and keep this Node process running.
2. **Local brain** — tries Ollama, LM Studio, Jan, llama.cpp, and Kobold on localhost, then an on-device Flan-T5 model. Keyword rules are the fallback.
3. **Safety** — skips OTPs, money/transfer asks, secrets, and jailbreaks. Rate-limits each contact.
4. **Cloud API** — optional Meta webhook if you later move the Business number to Vercel.

Replies are **first person as Tarik** (“main Tarik hoon”), never “on behalf of”. After one QR scan, login is saved on this machine (`data/whatsapp-session.json` + `data/baileys-auth`). Restart `npm run live` and it reconnects — no new QR unless you tap Log out or WhatsApp unlinks the device.

`npm run live` starts a keeper that restarts Next if it dies, pokes `/api/live` every 8 seconds, restores the saved WhatsApp login, and writes rules + heartbeat to `data/`. Voice and greetings auto-save on the desk. Vercel serverless cannot keep a scan socket 24/7; use this Node process (laptop or VPS) for always-live personal WhatsApp.

## What you get

- Always-live desk with detected local engines
- QR login: WhatsApp → Linked devices → Link a device
- Safety filters before any model runs
- Simulator that uses the same compose path
- Cloud API webhook with hub challenge and optional signature checks

## Run locally

```bash
npm install
cp .env.example .env.local
npm run live
```

Optional stronger free model:

```bash
# https://ollama.com
ollama pull llama3.2
```

Open [http://127.0.0.1:43217](http://127.0.0.1:43217). Click **Show QR**, scan from Linked devices once. The session is written to disk and reused forever on this host. Use **Voice** for language, tone, media, groups, signature, and extra facts. Use **Generate reply** to hear the same first-person voice.

## Connect WhatsApp Business

1. Create a Meta app at [developers.facebook.com](https://developers.facebook.com/apps/) and add the WhatsApp product.
2. Use the test number or a verified WhatsApp Business number. Copy the **Phone number ID** and a permanent **access token**.
3. Set these environment variables in Vercel (and in `.env.local` for local webhook tests):

| Variable | Required | Purpose |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Yes | Graph API bearer token |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | Number that sends replies |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Shared secret you invent for webhook setup |
| `WHATSAPP_APP_SECRET` | Recommended | Validates Meta signatures |
| `REPLY_RULES_JSON` | Optional | Same rules the dashboard can copy, so every Vercel function uses them |

4. Deploy to Vercel, then in Meta set the callback URL to:

```
https://YOUR-DOMAIN/api/whatsapp/webhook
```

Use the same verify token as `WHATSAPP_VERIFY_TOKEN`. Subscribe to `messages`.

5. Send a text from a number allowed on that WhatsApp app (the test number only accepts allow-listed testers).

## How replies are chosen

1. Auto-reply must be on.
2. If business hours are on and it is outside the window, send the after-hours text.
3. First enabled keyword found in the message wins.
4. Short greetings (`hi`, `hello`, `hey`, …) use the greeting reply.
5. Everything else uses the default reply.

Dashboard **Save** writes `data/store.json` on a long-lived disk (local). On Vercel that file is not shared across functions, so paste the copied JSON into `REPLY_RULES_JSON` after you settle on copy.

## Deploy on Vercel

```bash
npx vercel
```

Add the environment variables in the Vercel project, then redeploy. The webhook must be HTTPS, which Vercel provides.

## Limits

- Cloud API only talks to a **WhatsApp Business** number, not your everyday personal chat unless you migrate that number to Business and Meta approves it.
- The 24-hour customer care window still applies: you can reply to a user who messaged you first. Template messages are not implemented in this slice.
- Inbox history on Vercel is ephemeral unless you add a database later.
