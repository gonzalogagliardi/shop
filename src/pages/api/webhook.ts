import type { APIRoute } from 'astro';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { getDb } from '../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));

    if (body.type !== 'payment' || !body.data?.id) {
      return new Response('OK', { status: 200 });
    }

    const paymentId = String(body.data.id);

    const client = new MercadoPagoConfig({
      accessToken: import.meta.env.MP_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '',
    });
    const paymentApi = new Payment(client);
    const result = await paymentApi.get({ id: paymentId });

    const orderId  = result.external_reference;
    const mpStatus = result.status ?? 'unknown';

    if (!orderId) return new Response('OK', { status: 200 });

    const db = getDb();

    const { data: order } = await db
      .from('orders')
      .select('status')
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

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('OK', { status: 200 });
  }
};
