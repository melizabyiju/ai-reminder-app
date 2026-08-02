export async function onRequest(context) {
  // Support CORS if needed
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (context.request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { message } = await context.request.json();
    
    // Retrieve API key from environment variable
    const apiKey = context.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Gemini API key is not configured on Cloudflare." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const systemPrompt = `You are a conversational reminder assistant. Your goal is to talk to the user and schedule reminders.
Identify if the user wants to schedule a reminder, what the reminder is, and when it should happen (date and time in ISO 8601 format).
The current local time is ${new Date().toISOString()}.

Always respond with a valid JSON object matching this structure:
{
  "text": "Your conversational response here confirming the reminder or asking for more details.",
  "reminder": {
    "title": "Title of the reminder",
    "time": "ISO 8601 string of when to trigger"
  }
}
If no reminder is scheduled or you need clarification, set the "reminder" field to null.`;

    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(apiURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `${systemPrompt}\n\nUser message: ${message}` }] }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    return new Response(resultText, {
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
