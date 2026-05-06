import type { APIRoute } from 'astro';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { getDb } from '../../lib/supabase';

export const prerender = false;

const PRODUCTS: Record<string, { title: string; price: number }> = {
  cepillo: { title: 'Cepillo quitapelos reutilizable', price: 19990 },
  juguete: { title: 'Juguete interactivo para mascotas', price: 24990 },
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { product, nombre, email, telefono, calle, ciudad, provincia, cp } = await request.json();

    const item = PRODUCTS[product] ?? PRODUCTS.cepillo;
    const origin = new URL(request.url).origin;
    const orderId = `ORD-${Date.now()}`;

    // Guardar orden en DB (si falla, igual seguimos con MP)
    try {
      console.log('ENV_CHECK url:', process.env.SUPABASE_URL?.slice(0,20) ?? 'undefined');
      console.log('ENV_CHECK key length:', process.env.SUPABASE_SERVICE_KEY?.length ?? 0);
      console.log('ENV_CHECK key end:', process.env.SUPABASE_SERVICE_KEY?.slice(-20) ?? 'undefined');
      const db = getDb();
      const { error: dbError } = await db.from('orders').insert({
        id:        orderId,
        product,
        nombre:    nombre    ?? '',
        email:     email     ?? '',
        telefono:  telefono  ?? '',
        calle:     calle     ?? '',
        ciudad:    ciudad    ?? '',
        provincia: provincia ?? '',
        cp:        cp        ?? '',
        status:    'pending',
      });
      if (dbError) console.error('DB insert error (non-fatal):', dbError.message, dbError.code);
      else console.log('DB insert OK:', orderId);
    } catch (dbErr) {
      console.error('DB insert exception (non-fatal):', dbErr);
    }

    const client = new MercadoPagoConfig({
      accessToken: import.meta.env.MP_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '',
    });

    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            id:          product,
            title:       item.title,
            quantity:    1,
            unit_price:  item.price,
            currency_id: 'ARS',
          },
        ],
        payer: {
          name:  nombre ?? '',
          email: email  ?? '',
        },
        back_urls: {
          success: `${origin}/gracias`,
          failure: `${origin}/checkout?p=${product}`,
          pending: `${origin}/gracias`,
        },
        auto_return:          'approved',
        statement_descriptor: 'NovaShop',
        external_reference:   orderId,
        notification_url:     `${origin}/api/webhook`,
      },
    });

    return new Response(
      JSON.stringify({ init_point: result.init_point }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('MP preference error:', err);
    const detail = err?.cause?.message ?? err?.message ?? String(err);
    return new Response(
      JSON.stringify({ error: 'No se pudo crear la preferencia de pago.', detail }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
