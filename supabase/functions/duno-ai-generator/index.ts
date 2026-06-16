import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
serve(async () => {
  const apiKey = Deno.env.get("GROQ_API_KEY")!;
  const models = ["llama-3.3-70b-versatile", "llama3-8b-8192", "gemma2-9b-it", "llama-3.1-8b-instant"];
  const results: any = {};
  for (const model of models) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Busque o cliente pelo CNPJ 78.989.659/7980-80" }],
        tools: [{
          type: "function",
          function: { name: "find_customer", description: "find", parameters: { type: "object", properties: { cnpj: { type: "string" } } } }
        }]
      })
    });
    const data = await res.json();
    if (data.error) results[model] = "Error: " + data.error.message;
    else results[model] = "Success: " + JSON.stringify(data.choices[0].message.tool_calls?.[0] || "No tool call");
  }
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
});
