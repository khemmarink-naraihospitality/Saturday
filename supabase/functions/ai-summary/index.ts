import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SummaryItem {
  title: string;
  statusLabel: string;
  updates: string[];
}

interface SummaryGroup {
  title: string;
  items: SummaryItem[];
}

interface RequestBody {
  testOnly?: boolean;
  boardTitle?: string;
  period?: string;
  columns?: { title: string; type: string }[];
  groups?: SummaryGroup[];
}

async function getApiKey(): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (supabaseUrl && serviceKey) {
    const admin = createClient(supabaseUrl, serviceKey);
    const { data } = await admin
      .from('system_settings')
      .select('value')
      .eq('key', 'google_ai_key')
      .single();
    if (data?.value) return data.value as string;
  }
  return Deno.env.get('GOOGLE_AI_KEY') ?? '';
}

async function callGemini(apiKey: string, prompt: string, maxTokens = 1024): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }
  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error('No API key configured. Please set a Google AI API key in Admin → AI Settings.');
    }

    const body = await req.json() as RequestBody;

    // Test connection mode — send minimal prompt to verify key
    if (body.testOnly) {
      await callGemini(apiKey, 'Reply with one word: OK', 10);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normal summary mode
    const { boardTitle = '', period = '1 Month', columns = [], groups = [] } = body;

    const lines: string[] = [];
    for (const group of groups) {
      if (group.items.length === 0) continue;
      lines.push(`[Group: ${group.title}]`);
      for (const item of group.items) {
        const statusPart = item.statusLabel ? ` | Status: ${item.statusLabel}` : '';
        lines.push(`  • ${item.title}${statusPart}`);
        for (const upd of item.updates) {
          const text = upd.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
          if (text) lines.push(`    → ${text}`);
        }
      }
    }

    const activityText = lines.join('\n');
    const columnNames = columns.map(c => c.title).join(', ');

    const prompt = `You are an expert Project Manager assistant.

Summarize the activity of the board "${boardTitle}" over the past ${period} in a single concise paragraph in English. Cover:
- What has been completed or progressed
- Work currently in progress
- Any notable updates or issues worth highlighting

Board columns: ${columnNames}

Activity data:
${activityText || `No activity recorded in the past ${period}.`}

Write the summary as one clear paragraph suitable for an executive report. Be concise and factual.`;

    const summary = await callGemini(apiKey, prompt) || 'Could not generate summary.';

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
