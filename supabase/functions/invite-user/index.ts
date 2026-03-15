import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { email, redirectTo, boardId, workspaceId } = await req.json();

    if (!email) {
      throw new Error('Email is required');
    }

    // 1. Trigger Supabase Auth Invite (This sends the email automatically)
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      { redirectTo }
    );

    if (inviteError) throw inviteError;

    // 2. Record in pending_invites so our SQL Trigger can handle auto-accept on signup
    // We already have the trigger, but we need to make sure the record exists
    if (boardId || workspaceId) {
      const { error: pendingError } = await supabaseAdmin
        .from('pending_invites')
        .insert({
          email,
          board_id: boardId,
          workspace_id: workspaceId,
          role: 'editor',
          invited_by: (await supabaseAdmin.auth.getUser(req.headers.get('Authorization')?.split(' ')[1] ?? '')).data.user?.id
        });
        
      if (pendingError) console.error('Pending invite record error:', pendingError);
    }

    return new Response(
      JSON.stringify({ message: 'Invitation sent successfully', data: inviteData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
