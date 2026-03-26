import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

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

    const { email, redirectTo, workspaceName = 'NHG Saturday', inviterName = 'A Team Member' } = await req.json();

    if (!email) {
      throw new Error('Email is required');
    }

    // 1. Fetch SMTP Config and Template from system_settings
    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from('system_settings')
      .select('key, value')
      .in('key', ['smtp_config', 'invite_email_template']);

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      throw new Error('Failed to fetch email settings');
    }

    const smtpConfig = settingsData?.find(s => s.key === 'smtp_config')?.value;
    const template = settingsData?.find(s => s.key === 'invite_email_template')?.value;

    if (!smtpConfig || !smtpConfig.host) {
      throw new Error('SMTP Configuration is missing or incomplete in system_settings');
    }

    // 2. Generate Invite Link or Use Redirect Link (for existing users)
    let actionLink = redirectTo || 'https://nhgsaturday.com';
    let isNewUser = false;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: email,
      options: { redirectTo: actionLink }
    });

    if (linkError) {
      const errorMsg = linkError.message?.toLowerCase() || '';
      if (errorMsg.includes('user already registered') || errorMsg.includes('already exists')) {
        // User already exists. We can just send them a link to log in.
        actionLink = redirectTo || 'https://nhgsaturday.com';
      } else {
        console.error('Error generating link:', linkError);
        throw linkError;
      }
    } else if (linkData?.properties?.action_link) {
      // New user invite link generated successfully
      actionLink = linkData.properties.action_link;
      isNewUser = true;
    }

    // 3. Prepare Email Content
    let subject = template?.subject || `You have been invited to ${workspaceName}`;
    let htmlBody = template?.bodyHtml || `<p>You have been invited to ${workspaceName}.</p><p><a href="{{inviteLink}}">Click here to join</a></p>`;

    // Replace Variables
    subject = subject.replace(/\{\{workspaceName\}\}/g, workspaceName)
                     .replace(/\{\{inviterName\}\}/g, inviterName);
                     
    htmlBody = htmlBody.replace(/\{\{workspaceName\}\}/g, workspaceName)
                       .replace(/\{\{inviterName\}\}/g, inviterName)
                       .replace(/\{\{inviteLink\}\}/g, actionLink);

    // 4. Send Email via Nodemailer
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure, // true for 465, false for other ports
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.password,
      },
    });

    const mailOptions = {
      from: `"${smtpConfig.fromName || 'NHG Saturday'}" <${smtpConfig.fromEmail || smtpConfig.user}>`,
      to: email,
      subject: subject,
      html: htmlBody,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Message sent: %s', info.messageId);

    return new Response(
      JSON.stringify({ 
        message: 'Invitation email sent successfully via custom SMTP', 
        isNewUser,
        messageId: info.messageId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
