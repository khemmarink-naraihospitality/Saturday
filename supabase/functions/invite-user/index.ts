import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      email, 
      redirectTo, 
      workspaceName = 'NHG Saturday', 
      inviterName = 'A Team Member',
      action = 'invite', // 'invite' | 'assign_item' | 'test_email'
      itemName = '',
      boardName = ''
    } = await req.json();

    if (!email) {
      throw new Error('Email is required');
    }

    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from('system_settings')
      .select('key, value')
      .in('key', ['smtp_config', 'invite_email_template', 'invite_existing_user_template', 'assign_item_template']);

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      throw new Error('Failed to fetch email settings from DB');
    }

    const smtpConfig = settingsData?.find(s => s.key === 'smtp_config')?.value;
    const templateNew = settingsData?.find(s => s.key === 'invite_email_template')?.value;
    const templateExisting = settingsData?.find(s => s.key === 'invite_existing_user_template')?.value;
    const templateAssign = settingsData?.find(s => s.key === 'assign_item_template')?.value;

    if (!smtpConfig || !smtpConfig.host) {
      throw new Error('SMTP Configuration is missing or incomplete in system_settings');
    }

    let actionLink = redirectTo || 'https://nhgsaturday.com';
    let isNewUser = false;
    let finalTemplate;
    let returnedUserId = null;

    if (action === 'test_email') {
      finalTemplate = {
        subject: 'SMTP Connection Test Success',
        bodyHtml: `<p>Hello!</p><p>If you see this email, it means your SMTP configuration in <b>{{workspaceName}}</b> is working correctly.</p><p>Sent to: ${email}</p>`
      };
    } else if (action === 'assign_item') {
      finalTemplate = templateAssign;
      // Get the existing user's ID
      const { data: userRecord } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = userRecord?.users?.find(u => u.email === email);
      if (existingUser) returnedUserId = existingUser.id;
    } else {
      // Standard Workspace/Board Invite
      finalTemplate = templateNew;
      
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: { redirectTo: actionLink }
      });

      if (linkError) {
        const errorMsg = linkError.message?.toLowerCase() || '';
        if (errorMsg.includes('user already registered') || errorMsg.includes('already exists')) {
          actionLink = redirectTo || 'https://nhgsaturday.com';
          finalTemplate = templateExisting || templateNew; 
          
          const { data: userRecord } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = userRecord?.users?.find(u => u.email === email);
          if (existingUser) returnedUserId = existingUser.id;
        } else {
          throw linkError;
        }
      } else if (linkData?.properties?.action_link) {
        actionLink = linkData.properties.action_link;
        isNewUser = true;
        returnedUserId = linkData.user?.id || null;
      }
    }

    let subject = finalTemplate?.subject || `Notification from ${workspaceName}`;
    let htmlBody = finalTemplate?.bodyHtml || `<p>Please visit: <a href="{{inviteLink}}">Link</a></p>`;

    // Replace Variables with correct regex (matching exactly `{{varName}}`)
    subject = subject.replace(/\{\{workspaceName\}\}/g, workspaceName)
                     .replace(/\{\{inviterName\}\}/g, inviterName)
                     .replace(/\{\{itemName\}\}/g, itemName)
                     .replace(/\{\{boardName\}\}/g, boardName);
                     
    htmlBody = htmlBody.replace(/\{\{workspaceName\}\}/g, workspaceName)
                       .replace(/\{\{inviterName\}\}/g, inviterName)
                       .replace(/\{\{inviteLink\}\}/g, actionLink)
                       .replace(/\{\{itemName\}\}/g, itemName)
                       .replace(/\{\{boardName\}\}/g, boardName);

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
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
        message: action === 'test_email' ? 'Test email sent successfully!' : 'Email sent successfully', 
        isNewUser,
        userId: returnedUserId,
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
