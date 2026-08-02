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

    const systemPrompt = `You are an intelligent, conversational reminder assistant.
    1. Correct any grammar mistakes or slang in the user's input before extracting reminders.
    2. If the user mentions a project or goal (e.g., "Tomorrow I have a presentation"), break it down into logical steps (e.g., "Prepare presentation slides", "Rehearse presentation", "Attend presentation") and schedule them at appropriate times.
    3. The current local time is ${new Date().toISOString()}. Use this to calculate correct date-times.
    4. Support scheduling reminders for any future date/time.

    Always respond in valid JSON format:
    {
      "text": "Your conversational reply confirming the schedule or asking for details.",
      "reminders": [
        {
          "title": "Clean, grammatically correct title of reminder",
          "time": "ISO 8601 string of when to trigger"
        }
      ]
    }
    If no reminders should be created, set the "reminders" field to an empty array [].`;

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
