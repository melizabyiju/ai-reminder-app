export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (context.request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const subscription = await context.request.json();
    const kv = context.env.REMINDERS_KV;

    if (!kv) {
      return new Response(JSON.stringify({ error: "Cloudflare KV namespace REMINDERS_KV is not bound." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Save subscription by generate a unique key
    const id = `sub_${Date.now()}`;
    await kv.put(id, JSON.stringify(subscription));

    return new Response(JSON.stringify({ success: true, id }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
