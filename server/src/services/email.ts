import { Resend } from 'resend';
import { env, features } from '../env.js';
import type { schema } from '../db/client.js';

type Order = typeof schema.orders.$inferSelect;
type Product = typeof schema.products.$inferSelect;

const resend = features.email ? new Resend(env.RESEND_API_KEY) : null;

/// Cheap HTML escape for user-controlled fields interpolated into email bodies.
/// Buyers control customerEmail and pickupDisplayName; admins control product.name
/// and product.description. We escape both — no reason to trust either at the
/// HTML rendering layer.
const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );

/// Support contacts shown in every email footer.
const SUPPORT = {
  email: 'orders@ipe.city',
  telegram: 'https://t.me/+kmGbiSj7XFRhZjUx',
  instagram: 'https://instagram.com/ipecity0x',
  x: 'https://x.com/ipecity',
};

/// Brand palette (mirrors the storefront tokens — navy primary, cream ground,
/// gold accent). Kept inline because email clients strip <style>/external CSS.
const C = {
  navy: '#002642',
  navy700: '#001e34',
  cream: '#f8f5ec',
  ink: '#0e0e0c',
  muted: 'rgba(14,14,12,0.55)',
  gold: '#ffb600',
  line: 'rgba(0,38,66,0.12)',
};

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

async function send({ to, subject, html }: SendArgs) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY missing — skipping "${subject}" to ${to}`);
    return;
  }
  try {
    // Resend does NOT throw on API errors — it resolves with { data, error }.
    // We must inspect `error` explicitly or a rejected send looks like success.
    const { data, error } = await resend.emails.send({ from: env.RESEND_FROM_EMAIL, to, subject, html });
    if (error) {
      console.error(`[email] rejected "${subject}" to ${to}:`, error);
      return;
    }
    console.log(`[email] sent "${subject}" to ${to} (id=${data?.id ?? '?'})`);
  } catch (err) {
    console.error(`[email] failed to send "${subject}" to ${to}`, err);
  }
}

/// A branded navy CTA button (table-based for Outlook compatibility).
const button = (href: string, label: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr><td style="border-radius:8px;background:${C.navy};">
      <a href="${esc(href)}" style="display:inline-block;padding:12px 22px;color:${C.cream};font-weight:600;font-size:15px;text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td></tr>
  </table>`;

const layout = (title: string, body: string) => `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:${C.cream};font-family:-apple-system,'DM Sans',Segoe UI,Roboto,Inter,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(title)} — Ipê Store</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${C.line};">
        <!-- accent bar -->
        <tr><td style="height:5px;background:linear-gradient(90deg,#ffb600 0%,#a2d729 50%,#3aa5ff 100%);font-size:0;line-height:0;">&nbsp;</td></tr>
        <!-- header -->
        <tr><td style="background:${C.navy};padding:22px 32px;">
          <span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;color:${C.cream};">ipê</span>
          <span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;color:${C.gold};">.city</span>
          <span style="font-size:12px;font-weight:600;letter-spacing:2px;color:rgba(248,245,236,0.6);text-transform:uppercase;margin-left:8px;">Store</span>
        </td></tr>
        <!-- body -->
        <tr><td style="padding:32px;">
          <h1 style="font-size:20px;font-weight:700;color:${C.navy};margin:0 0 16px;">${title}</h1>
          <div style="font-size:15px;line-height:1.6;color:${C.ink};">${body}</div>
        </td></tr>
        <!-- footer -->
        <tr><td style="padding:0 32px 28px;">
          <hr style="border:none;border-top:1px solid ${C.line};margin:0 0 18px;">
          <p style="font-size:13px;color:${C.muted};margin:0 0 10px;">Need help with your order? We're here:</p>
          <p style="font-size:13px;margin:0 0 14px;line-height:1.9;">
            <a href="mailto:${SUPPORT.email}" style="color:${C.navy};text-decoration:none;font-weight:600;">${SUPPORT.email}</a>
            &nbsp;·&nbsp;<a href="${SUPPORT.telegram}" style="color:${C.navy};text-decoration:none;font-weight:600;">Telegram</a>
            &nbsp;·&nbsp;<a href="${SUPPORT.instagram}" style="color:${C.navy};text-decoration:none;font-weight:600;">Instagram</a>
            &nbsp;·&nbsp;<a href="${SUPPORT.x}" style="color:${C.navy};text-decoration:none;font-weight:600;">X</a>
          </p>
          <p style="font-size:11px;color:${C.muted};margin:0 0 6px;">
            This is an automated message — please do not reply to this email.
            For anything, reach us at <a href="mailto:${SUPPORT.email}" style="color:${C.muted};">${SUPPORT.email}</a>.
          </p>
          <p style="font-size:11px;color:${C.muted};margin:0;">
            You received this because you placed an order at Ipê Store.
            <a href="${esc(env.PUBLIC_APP_URL)}/orders" style="color:${C.muted};">View your orders</a>
            &nbsp;·&nbsp;
            <a href="mailto:${SUPPORT.email}?subject=Unsubscribe%20from%20order%20updates" style="color:${C.muted};">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const fmtAmount = (o: Order, p: Product) => {
  switch (o.paymentMethod) {
    case 'ipe': return `${(Number(BigInt(o.totalPaid)) / 1e18).toFixed(4)} IPE`;
    case 'usdc': return `${(Number(BigInt(o.totalPaid)) / 1e6).toFixed(2)} USDC`;
    case 'pix': return `R$ ${(Number(o.totalPaid) / 100).toFixed(2)}`;
    case 'crypto-gateway': return `R$ ${(Number(p.priceBrl) / 100).toFixed(2)} (paid in crypto)`;
  }
};

export async function sendOrderCreated(order: Order, product: Product) {
  if (!order.customerEmail) return;
  const body = `
    <p>Hi! We received your order for <strong>${esc(product.name)}</strong>.</p>
    <p style="margin:16px 0;">
      Quantity: <strong>${order.quantity}</strong><br>
      Total: <strong>${esc(fmtAmount(order, product))}</strong><br>
      Status: <strong>${esc(order.status)}</strong>
    </p>
    ${
      order.status === 'awaiting_payment'
        ? `<p>Complete the payment using the QR code we showed at checkout. We'll email you again once it confirms.</p>`
        : `<p>Payment confirmed. We'll send another note once your item ${order.deliveryMethod === 'pickup' ? 'is ready for pickup' : 'ships'}.</p>`
    }
    ${button(`${env.PUBLIC_APP_URL}/orders`, 'Track your order')}
  `;
  await send({
    to: order.customerEmail,
    subject: `Your Ipê Store order — ${product.name}`,
    html: layout('Order received', body),
  });
}

/// Thank-you email sent once payment confirms. For pickup orders it embeds the
/// signed pickup QR (served as a PNG by the API — data: URIs get stripped by
/// Gmail) so the buyer can scan it straight from their inbox at the event.
export async function sendOrderPaid(order: Order, product: Product) {
  if (!order.customerEmail) return;
  const isPickup = order.deliveryMethod === 'pickup';
  const qrUrl = `${env.PUBLIC_API_URL}/orders/${order.id}/pickup-qr.png`;

  const pickupBlock = isPickup
    ? `
    <div style="margin:24px 0;padding:24px;background:${C.cream};border-radius:12px;text-align:center;">
      <p style="font-size:14px;font-weight:600;color:${C.navy};margin:0 0 4px;">Your pickup ticket</p>
      <p style="font-size:13px;color:${C.muted};margin:0 0 16px;">Show this QR at <strong>${esc(order.pickupEventId ?? 'the event')}</strong> to collect your item.</p>
      <img src="${esc(qrUrl)}" alt="Pickup QR code" width="200" height="200" style="width:200px;height:200px;border-radius:8px;background:#fff;padding:12px;border:1px solid ${C.line};" />
    </div>`
    : `<p>We're getting your item ready to ship — we'll email you the tracking as soon as it's on the way.</p>`;

  const body = `
    <p>Thank you for your order! Your payment for <strong>${esc(product.name)}</strong> has been confirmed. 🎉</p>
    <p style="margin:16px 0;">
      Quantity: <strong>${order.quantity}</strong><br>
      Total: <strong>${esc(fmtAmount(order, product))}</strong>
    </p>
    ${pickupBlock}
    ${order.buyerAddress ? `<p style="font-size:13px;color:${C.muted};">Your onchain receipt was minted to <code style="color:${C.navy};">${esc(order.buyerAddress.slice(0, 10))}…${esc(order.buyerAddress.slice(-6))}</code>.</p>` : ''}
    ${button(`${env.PUBLIC_APP_URL}/orders`, 'View your order')}
  `;
  await send({
    to: order.customerEmail,
    subject: `Thank you for your order — ${product.name}`,
    html: layout('Thank you for your order!', body),
  });
}

export async function sendOrderShipped(order: Order, product: Product) {
  if (!order.customerEmail) return;
  const body = `
    <p>Your <strong>${esc(product.name)}</strong> is on its way.</p>
    ${order.trackingCode ? `<p>Tracking code: <strong>${esc(order.trackingCode)}</strong></p>` : ''}
  `;
  await send({
    to: order.customerEmail,
    subject: `Your order shipped — ${product.name}`,
    html: layout('On its way', body),
  });
}

export async function sendOrderReadyForPickup(order: Order, product: Product) {
  if (!order.customerEmail) return;
  const body = `
    <p>Your <strong>${esc(product.name)}</strong> is ready for pickup at <strong>${esc(order.pickupEventId)}</strong>.</p>
    <p>Show your wallet (the 1155 receipt) and your ID at the event to collect.</p>
  `;
  await send({
    to: order.customerEmail,
    subject: `Ready for pickup — ${product.name}`,
    html: layout('Ready for pickup', body),
  });
}

export async function sendOrderDelivered(order: Order, product: Product) {
  if (!order.customerEmail) return;
  const body = `<p>Your <strong>${esc(product.name)}</strong> has been delivered. Hope you love it.</p>`;
  await send({
    to: order.customerEmail,
    subject: `Delivered — ${product.name}`,
    html: layout('Delivered', body),
  });
}

export async function sendAdminNewOrder(order: Order, product: Product) {
  if (!env.ADMIN_NOTIFICATION_EMAIL) return;
  const body = `
    <p>New order placed.</p>
    <p style="font-size:13px;">
      Product: <strong>${esc(product.name)}</strong><br>
      Quantity: ${order.quantity}<br>
      Total: ${esc(fmtAmount(order, product))}<br>
      Method: ${esc(order.paymentMethod)} (${esc(order.paymentProvider)})<br>
      Delivery: ${esc(order.deliveryMethod)}${order.pickupEventId ? ` @ ${esc(order.pickupEventId)}` : ''}<br>
      Buyer: ${esc(order.buyerAddress ?? order.customerEmail ?? '—')}<br>
      Status: ${esc(order.status)}
    </p>
    <p><a href="${esc(env.PUBLIC_APP_URL)}/admin">Open admin</a></p>
  `;
  await send({
    to: env.ADMIN_NOTIFICATION_EMAIL,
    subject: `[Ipê Store] new order — ${product.name}`,
    html: layout('New order', body),
  });
}
