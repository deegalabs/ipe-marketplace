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
    await resend.emails.send({ from: env.RESEND_FROM_EMAIL, to, subject, html });
    console.log(`[email] sent "${subject}" to ${to}`);
  } catch (err) {
    console.error(`[email] failed to send "${subject}" to ${to}`, err);
  }
}

const layout = (title: string, body: string) => `
<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Inter,sans-serif;background:#f8f5ec;padding:24px;color:#0e0e0c;">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid rgba(10,58,47,0.1);">
    <h1 style="color:#0a3a2f;font-size:22px;margin:0 0 16px;">IPE Store</h1>
    <h2 style="font-size:18px;margin:0 0 12px;">${title}</h2>
    ${body}
    <hr style="border:none;border-top:1px solid rgba(10,58,47,0.1);margin:24px 0;">
    <p style="font-size:12px;color:rgba(14,14,12,0.5);margin:0;">
      You received this because you placed an order at IPE Store. Order details: <a href="${env.PUBLIC_APP_URL}/orders" style="color:#0a3a2f;">${env.PUBLIC_APP_URL}/orders</a>
    </p>
  </div>
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
    <p><a href="${esc(env.PUBLIC_APP_URL)}/orders" style="display:inline-block;background:#0a3a2f;color:#f8f5ec;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:500;">Track your order</a></p>
  `;
  await send({
    to: order.customerEmail,
    subject: `Your IPE Store order — ${product.name}`,
    html: layout('Order received', body),
  });
}

export async function sendOrderPaid(order: Order, product: Product) {
  if (!order.customerEmail) return;
  const body = `
    <p>Payment for your <strong>${esc(product.name)}</strong> has cleared.</p>
    <p>We're getting it ready ${order.deliveryMethod === 'pickup' ? `for pickup at <strong>${esc(order.pickupEventId ?? 'the event')}</strong>` : 'to ship'}.</p>
    ${order.buyerAddress ? `<p style="font-size:13px;color:#0a3a2f;">Your onchain receipt was minted to <code>${esc(order.buyerAddress.slice(0, 10))}…${esc(order.buyerAddress.slice(-6))}</code>.</p>` : ''}
  `;
  await send({
    to: order.customerEmail,
    subject: `Payment received — ${product.name}`,
    html: layout('Payment confirmed', body),
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
    subject: `[IPE Store] new order — ${product.name}`,
    html: layout('New order', body),
  });
}
