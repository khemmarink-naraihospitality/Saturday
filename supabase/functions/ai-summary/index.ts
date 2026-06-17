import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
  boardTitle: string;
  period: string;
  columns: { title: string; type: string }[];
  groups: SummaryGroup[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_AI_KEY');
    if (!apiKey) {
      throw new Error('GOOGLE_AI_KEY secret is not configured');
    }

    const { boardTitle, period, columns, groups } = await req.json() as RequestBody;

    // Build a readable text block of board activity for the prompt
    const lines: string[] = [];
    for (const group of groups) {
      if (group.items.length === 0) continue;
      lines.push(`[กลุ่ม: ${group.title}]`);
      for (const item of group.items) {
        const statusPart = item.statusLabel ? ` | สถานะ: ${item.statusLabel}` : '';
        lines.push(`  • ${item.title}${statusPart}`);
        for (const upd of item.updates) {
          // Strip HTML tags for cleaner text
          const text = upd.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
          if (text) lines.push(`    → ${text}`);
        }
      }
    }

    const activityText = lines.join('\n');
    const columnNames = columns.map(c => c.title).join(', ');

    const periodText = period || '1 Month';
    const prompt = `You are an expert Project Manager assistant.

Summarize the activity of the board "${boardTitle}" over the past ${periodText} in a single concise paragraph in English. Cover:
- What has been completed or progressed
- Work currently in progress
- Any notable updates or issues worth highlighting

Board columns: ${columnNames}

Activity data:
${activityText || `No activity recorded in the past ${periodText}.`}

Write the summary as one clear paragraph suitable for an executive report. Be concise and factual.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API error ${geminiRes.status}: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const summary: string =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'ไม่สามารถสร้างสรุปได้';

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
