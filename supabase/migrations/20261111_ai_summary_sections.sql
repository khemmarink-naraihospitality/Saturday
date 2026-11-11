-- The AI Summary tab, in two sections (11-Nov-2026).
--
-- The user: "add an AI Summary tab in two sections — a summary we calculate
-- ourselves (no AI) and the Gemini API's free tier — the kind that costs
-- nothing", in both palettes.
--
-- The tab is now on every board for everyone: its first section is worked out
-- in the browser from the board itself. Admin › AI Settings' switch
-- (system_settings.ai_summary_enabled) now governs only the Gemini section,
-- since that one sends the board's tasks and comments to Google.
--
-- 1. Everyone signed in may read that switch (system_settings is otherwise
--    admins-only), so the section can say it is off instead of failing.
-- 2. board_ai_summaries keeps the last summary Gemini wrote for each board, so
--    the people on a board read it without spending the free quota again.
--    Read with the board (whoever can see the board can see its summary);
--    written only by the ai-summary edge function, with the service role.

DROP POLICY IF EXISTS "Signed-in users see whether Gemini summaries are on" ON public.system_settings;
CREATE POLICY "Signed-in users see whether Gemini summaries are on" ON public.system_settings
    FOR SELECT TO authenticated
    USING (key = 'ai_summary_enabled');

CREATE TABLE IF NOT EXISTS public.board_ai_summaries (
    board_id uuid PRIMARY KEY REFERENCES public.boards(id) ON DELETE CASCADE,
    summary jsonb NOT NULL,
    language text NOT NULL CHECK (language IN ('th', 'en')),
    period text NOT NULL CHECK (period IN ('7d', '30d', '90d', 'all')),
    model text,
    task_count integer,
    generated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    generated_by_name text,
    generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.board_ai_summaries ENABLE ROW LEVEL SECURITY;

-- The subquery runs under the reader's own rules on boards.
DROP POLICY IF EXISTS "Read a board's AI summary with the board" ON public.board_ai_summaries;
CREATE POLICY "Read a board's AI summary with the board" ON public.board_ai_summaries
    FOR SELECT TO authenticated
    USING (board_id IN (SELECT b.id FROM public.boards b));

REVOKE ALL ON public.board_ai_summaries FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.board_ai_summaries FROM authenticated;
GRANT SELECT ON public.board_ai_summaries TO authenticated;
