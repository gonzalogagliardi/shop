import type { APIRoute } from 'astro';
import { MercadoPagoConfig, Payment } from 'mercadopago';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();

    const client = new MercadoPagoConfig({
      accessToken: import.meta.env.MP_ACCESS_TOKEN,
    });

    const payment = new Payment(client);

    const result = await payment.create({
      body: {
        ...body,
        external_reference: `novashop-${Date.now()}`,
        statement_descriptor: 'NovaShop',
      },
    });

    return new Response(
      JSON.stringify({ status: result.status, status_detail: result.status_detail }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('MP payment error:', err);
    return new Response(
      JSON.stringify({ error: 'No se pudo procesar el pago.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
