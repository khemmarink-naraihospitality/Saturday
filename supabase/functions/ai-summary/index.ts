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

    const { boardTitle, columns, groups } = await req.json() as RequestBody;

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

    const prompt = `คุณคือผู้ช่วย Project Manager ที่เชี่ยวชาญ

กรุณาสรุปกิจกรรมของบอร์ด "${boardTitle}" ในช่วง 30 วันที่ผ่านมา เป็นย่อหน้าเดียวในภาษาไทย ครอบคลุม:
- สิ่งที่สำเร็จแล้วหรืองานที่คืบหน้า
- งานที่กำลังดำเนินการอยู่
- ประเด็นสำคัญหรือ Updates ที่น่าสนใจ

คอลัมน์ในบอร์ด: ${columnNames}

ข้อมูลกิจกรรม:
${activityText || 'ไม่มีกิจกรรมในช่วง 30 วันที่ผ่านมา'}

เขียนสรุปเป็นย่อหน้าเดียว กระชับ ชัดเจน เหมาะสำหรับรายงานให้ผู้บริหาร`;

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
