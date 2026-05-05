import type { APIRoute } from 'astro';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { db } from '../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));

    // Solo procesar notificaciones de pago
    if (body.type !== 'payment' || !body.data?.id) {
      return new Response('OK', { status: 200 });
    }

    const paymentId = String(body.data.id);

    // Consultar el pago a MP (no confiar en los datos del webhook)
    const client = new MercadoPagoConfig({
      accessToken: import.meta.env.MP_ACCESS_TOKEN,
    });
    const paymentApi = new Payment(client);
    const result = await paymentApi.get({ id: paymentId });

    const orderId = result.external_reference;
    const mpStatus = result.status ?? 'unknown';

    if (!orderId) return new Response('OK', { status: 200 });

    // Idempotencia: si ya está aprobado, ignorar
    const { data: order } = await db
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single();

    if (order?.status === 'approved') {
      return new Response('OK', { status: 200 });
    }

    // Mapear estado de MP a estado interno
    const newStatus =
      mpStatus === 'approved'                        ? 'approved' :
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
    // Siempre 200 para que MP no reintente indefinidamente
    return new Response('OK', { status: 200 });
  }
};
