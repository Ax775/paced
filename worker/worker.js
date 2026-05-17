/**
 * Aura — Premium License Worker
 * ------------------------------
 * Cloudflare Worker dat Stripe webhooks ontvangt en ED25519-
 * gehandtekende licenties uitstuurt na een succesvolle betaling.
 *
 *  Endpoint:  POST /stripe/webhook
 *
 *  Required Cloudflare secrets (via `wrangler secret put`):
 *    STRIPE_WEBHOOK_SECRET   — Stripe Dashboard → Developers → Webhooks
 *    LICENSE_PRIV_KEY        — hex van `node worker/gen-keypair.mjs`
 *    RESEND_API_KEY          — voor e-mail levering (of vervang door je
 *                              eigen e-mail provider; geen vendor-lock)
 *
 *  Stripe Dashboard config:
 *    Developers → Webhooks → Add endpoint
 *      URL:    https://<jouw-worker>.workers.dev/stripe/webhook
 *      Events: checkout.session.completed
 *
 *  De Worker ontvangt geen Aura-gebruikersdata. Alleen Stripe-event
 *  data (e-mail, sessie-id, bedrag) — die hebben we strikt nodig om de
 *  licentie naar de juiste mailbox te sturen. Niets wordt gelogd of
 *  bewaard buiten het webhook-event zelf.
 */

import { signAsync, getPublicKeyAsync } from '@noble/ed25519';

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname === '/stripe/webhook') {
      return handleStripeWebhook(req, env, ctx);
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  },
};

/* ──────────────────────────  Stripe webhook  ──────────────────────── */

async function handleStripeWebhook(req, env, ctx) {
  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Missing signature', { status: 400 });

  // Stripe-signature header: t=…,v1=…
  // We checken de v1 (HMAC-SHA256 over `${t}.${rawBody}`).
  let ok = false;
  try {
    ok = await verifyStripeSignature(sig, rawBody, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response('Signature verification failed', { status: 400 });
  }
  if (!ok) return new Response('Invalid signature', { status: 400 });

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  if (event.type !== 'checkout.session.completed') {
    // Andere events accepteren we (ack 200) maar negeren we — Stripe
    // anders blijft retryen.
    return new Response('ok (ignored)', { status: 200 });
  }

  const session = event.data?.object;
  const email = session?.customer_details?.email;
  if (!email) {
    return new Response('Session missing customer email', { status: 400 });
  }

  // Bouw + onderteken een lifetime-licentie. Sub is een opaque random id
  // — koppelt nergens aan de Aura-gebruikerprofiel, alleen aan deze
  // betaal-sessie voor revoke-doeleinden later.
  const payload = {
    iat:  new Date().toISOString(),
    sub:  crypto.randomUUID(),
    plan: 'lifetime',
    // 'exp' weglaten voor lifetime. Voor abonnement: voeg toe.
  };

  const licenseKey = await signLicense(payload, env.LICENSE_PRIV_KEY);

  // E-mail de licentie. ctx.waitUntil zodat het webhook-200-response
  // niet wacht op e-mail levering — Stripe verlangt < 30s response.
  ctx.waitUntil(sendLicenseEmail(email, licenseKey, env));

  return new Response('ok', { status: 200 });
}

/* ──────────────────  Stripe signature verification  ──────────────── */

async function verifyStripeSignature(header, body, secret) {
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=')),
  );
  const t  = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  // Reject signatures older than 5 min (Stripe replay-attack guard)
  const ts = parseInt(t, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${t}.${body}`),
  );
  const computed = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  // Constant-time compare
  if (computed.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

/* ──────────────────────────  License signing  ─────────────────────── */

function base64UrlEncode(bytes) {
  // bytes is Uint8Array
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function signLicense(payload, privKeyHex) {
  const payloadJson  = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadJson);
  const payloadB64   = base64UrlEncode(payloadBytes);

  const priv = hexToBytes(privKeyHex);
  const sig  = await signAsync(payloadBytes, priv);
  const sigB64 = base64UrlEncode(sig);

  return `AURA-PREMIUM-${payloadB64}.${sigB64}`;
}

/* ─────────────────────────  Email delivery  ───────────────────────── */
// Default implementatie via Resend (resend.com). Vervang door je eigen
// provider naar smaak — Postmark, SendGrid, AWS SES, MailerSend.

async function sendLicenseEmail(toEmail, licenseKey, env) {
  if (!env.RESEND_API_KEY) {
    console.error('[Worker] RESEND_API_KEY missing — skipping email');
    return;
  }

  const subject = 'Je Aura Premium licentie';
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #3E3B33;">
      <h1 style="font-size: 22px; margin: 0 0 12px;">Welkom bij Aura Premium 🌿</h1>
      <p>Bedankt voor je aankoop. Hieronder vind je je licentie-sleutel.</p>
      <p>Open Aura → Instellingen → Aura Premium → "Activeer" → plak deze sleutel:</p>
      <p style="background:#F4E2D8; padding:14px; border-radius:8px; font-family:monospace; font-size:13px; word-break:break-all; user-select:all;">
        ${licenseKey}
      </p>
      <p style="font-size:12px; color:#7A6E5D; margin-top:24px;">
        Bewaar deze e-mail. De sleutel werkt offline en is niet aan een account gekoppeld.
        Verlies je 'm? Stuur een reply met je betalingsbevestiging dan zoeken we 'm op.
      </p>
    </div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.LICENSE_FROM_EMAIL || 'aura@example.com',
      to: [toEmail],
      subject,
      html,
    }),
  });

  if (!r.ok) {
    console.error('[Worker] Email send failed', r.status, await r.text());
  }
}
