import type { APIRoute } from 'astro';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { Resend } from 'resend';
import { getDb } from '../../lib/supabase';

export const prerender = false;

const PRICES: Record<string, number> = {
  cepillo: 19990,
  juguete: 24990,
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));

    if (body.type !== 'payment' || !body.data?.id) {
      return new Response('OK', { status: 200 });
    }

    const paymentId = String(body.data.id);

    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN ?? '',
    });
    const paymentApi = new Payment(client);
    const result = await paymentApi.get({ id: paymentId });

    const orderId  = result.external_reference;
    const mpStatus = result.status ?? 'unknown';

    if (!orderId) return new Response('OK', { status: 200 });

    const db = getDb();

    // Idempotencia
    const { data: order } = await db
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (order?.status === 'approved') {
      return new Response('OK', { status: 200 });
    }

    const newStatus =
      mpStatus === 'approved'                              ? 'approved' :
      mpStatus === 'pending' || mpStatus === 'in_process' ? 'pending'  :
      'rejected';

    await db.from('orders').update({
      status:        newStatus,
      mp_payment_id: paymentId,
      mp_status:     mpStatus,
    }).eq('id', orderId);

    // Email al dueño solo cuando el pago se aprueba
    if (mpStatus === 'approved' && order) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY ?? '');
        const precio = PRICES[order.product] ?? 0;

        await resend.emails.send({
          from:    'NovaShop <onboarding@resend.dev>',
          to:      'gagliardigonzalo@gmail.com',
          subject: `🛍️ Nueva venta — ${order.product} — $${precio.toLocaleString('es-AR')}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <h2 style="color:#1D4ED8;">Nueva venta confirmada</h2>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Orden</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${orderId}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Producto</td><td style="padding:8px;border-bottom:1px solid #eee;">${order.product}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Monto</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#16a34a;">$${precio.toLocaleString('es-AR')}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Nombre</td><td style="padding:8px;border-bottom:1px solid #eee;">${order.nombre}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Email</td><td style="padding:8px;border-bottom:1px solid #eee;">${order.email}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Teléfono</td><td style="padding:8px;border-bottom:1px solid #eee;">${order.telefono}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Dirección</td><td style="padding:8px;border-bottom:1px solid #eee;">${order.calle}, ${order.ciudad}, ${order.provincia} (${order.cp})</td></tr>
                <tr><td style="padding:8px;color:#666;">Pago MP</td><td style="padding:8px;">${paymentId}</td></tr>
              </table>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error('Email error (non-fatal):', emailErr);
      }
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('OK', { status: 200 });
  }
};
