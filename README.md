# Relay — WhatsApp auto-reply on Vercel

Relay is a Next.js app you deploy on Vercel. Meta’s WhatsApp Cloud API posts incoming messages to `/api/whatsapp/webhook`. Relay picks a reply from your rules and sends it back so the chat is answered while you are away.

This uses the **official WhatsApp Business Cloud API**. It cannot log into a personal WhatsApp account with a QR code. WhatsApp does not allow that on a serverless host, and unofficial “WhatsApp Web” bots violate their terms.

## What you get

- A control desk to write keyword, greeting, default, and after-hours replies
- A simulator that uses the same reply engine without Meta credentials
- A production webhook that verifies Meta’s hub challenge and optional `X-Hub-Signature-256`
- Inbox of simulated and (when the function instance still has them) live messages

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:43217](http://127.0.0.1:43217). Use **Generate reply** to test rules before you connect Meta.

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
