import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, Mail, Server } from 'lucide-react';

export const EmailSettings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [smtpConfig, setSmtpConfig] = useState({
        host: '',
        port: 587,
        secure: false,
        user: '',
        password: '',
        fromEmail: '',
        fromName: ''
    });
    
    const [inviteTemplate, setInviteTemplate] = useState({
        subject: '',
        bodyHtml: ''
    });

    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('system_settings')
                .select('key, value')
                .in('key', ['smtp_config', 'invite_email_template']);
            
            if (error) throw error;

            if (data) {
                const smtp = data.find(item => item.key === 'smtp_config');
                const template = data.find(item => item.key === 'invite_email_template');
                
                if (smtp?.value) setSmtpConfig(smtp.value);
                if (template?.value) setInviteTemplate(template.value);
            }
        } catch (error: any) {
            console.error('Error fetching settings:', error);
            setMessage({ type: 'error', text: 'Failed to load settings: ' + error.message });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setMessage({ type: '', text: '' });
            
            const updates = [
                {
                    key: 'smtp_config',
                    value: smtpConfig,
                    description: 'SMTP connection settings'
                },
                {
                    key: 'invite_email_template',
                    value: inviteTemplate,
                    description: 'Template for workspace/board invitations'
                }
            ];

            const { error } = await supabase
                .from('system_settings')
                .upsert(updates, { onConflict: 'key' });

            if (error) throw error;

            setMessage({ type: 'success', text: 'Settings saved successfully' });
            
            // Clear success message after 3 seconds
            setTimeout(() => setMessage({ type: '', text: '' }), 3000);
            
        } catch (error: any) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: 'Failed to save settings: ' + error.message });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '24px', color: '#64748b' }}>Loading settings...</div>;
    }

    return (
        <div style={{ maxWidth: '800px' }}>
            {message.text && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '24px',
                    backgroundColor: message.type === 'success' ? '#def7ec' : '#fee2e2',
                    color: message.type === 'success' ? '#03543f' : '#991b1b',
                    fontSize: '14px',
                    border: `1px solid ${message.type === 'success' ? '#31c48d' : '#f87171'}`
                }}>
                    {message.text}
                </div>
            )}

            <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Server size={20} color="#6366f1" />
                    SMTP Configuration
                </h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                        <label style={labelStyle}>SMTP Host</label>
                        <input 
                            type="text" 
                            value={smtpConfig.host}
                            onChange={e => setSmtpConfig({...smtpConfig, host: e.target.value})}
                            style={inputStyle}
                            placeholder="e.g. smtp.gmail.com"
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Port</label>
                            <input 
                                type="number" 
                                value={smtpConfig.port}
                                onChange={e => setSmtpConfig({...smtpConfig, port: parseInt(e.target.value) || 587})}
                                style={inputStyle}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', marginTop: '24px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    checked={smtpConfig.secure}
                                    onChange={e => setSmtpConfig({...smtpConfig, secure: e.target.checked})}
                                />
                                Secure (SSL/TLS)
                            </label>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                        <label style={labelStyle}>Username</label>
                        <input 
                            type="text" 
                            value={smtpConfig.user}
                            onChange={e => setSmtpConfig({...smtpConfig, user: e.target.value})}
                            style={inputStyle}
                            autoComplete="off"
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Password / App Password</label>
                        <input 
                            type="password" 
                            value={smtpConfig.password}
                            onChange={e => setSmtpConfig({...smtpConfig, password: e.target.value})}
                            style={inputStyle}
                            autoComplete="new-password"
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={labelStyle}>From Email</label>
                        <input 
                            type="email" 
                            value={smtpConfig.fromEmail}
                            onChange={e => setSmtpConfig({...smtpConfig, fromEmail: e.target.value})}
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>From Name</label>
                        <input 
                            type="text" 
                            value={smtpConfig.fromName}
                            onChange={e => setSmtpConfig({...smtpConfig, fromName: e.target.value})}
                            style={inputStyle}
                        />
                    </div>
                </div>
            </div>

            <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Mail size={20} color="#10b981" />
                    Invitation Email Template
                </h2>
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <strong>Available Variables:</strong> <code style={codeStyle}>{"{{workspaceName}}"}</code>, <code style={codeStyle}>{"{{inviterName}}"}</code>, <code style={codeStyle}>{"{{inviteLink}}"}</code>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Email Subject</label>
                    <input 
                        type="text" 
                        value={inviteTemplate.subject}
                        onChange={e => setInviteTemplate({...inviteTemplate, subject: e.target.value})}
                        style={inputStyle}
                    />
                </div>
                <div>
                    <label style={labelStyle}>Email HTML Body</label>
                    <textarea 
                        value={inviteTemplate.bodyHtml}
                        onChange={e => setInviteTemplate({...inviteTemplate, bodyHtml: e.target.value})}
                        style={{ ...inputStyle, minHeight: '200px', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px' }}
                    />
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 24px',
                        backgroundColor: '#6366f1',
                        border: 'none',
                        borderRadius: '6px',
                        color: 'white',
                        fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        opacity: saving ? 0.7 : 1,
                        transition: 'background-color 0.2s'
                    }}
                >
                    <Save size={18} />
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: '#475569',
    marginBottom: '6px'
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
};

const codeStyle: React.CSSProperties = {
    backgroundColor: '#e2e8f0',
    padding: '2px 4px',
    borderRadius: '4px',
    color: '#0f172a'
};
