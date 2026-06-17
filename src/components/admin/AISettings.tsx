import { useState, useEffect } from 'react';
import { Sparkles, Eye, EyeOff, CheckCircle, XCircle, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export const AISettings = () => {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [hasExistingKey, setHasExistingKey] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null);
    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

    useEffect(() => {
        supabase
            .from('system_settings')
            .select('key,value')
            .in('key', ['google_ai_key', 'ai_summary_enabled'])
            .then(({ data }) => {
                setHasExistingKey(!!data?.find(r => r.key === 'google_ai_key')?.value);
                setEnabled(data?.find(r => r.key === 'ai_summary_enabled')?.value === 'true');
            });
    }, []);

    const handleToggle = async () => {
        const next = !enabled;
        setEnabled(next);
        await supabase.from('system_settings').upsert({
            key: 'ai_summary_enabled',
            value: String(next),
            updated_at: new Date().toISOString(),
        });
    };

    const handleSave = async () => {
        if (!apiKey.trim()) return;
        setSaving(true);
        setSaveResult(null);
        try {
            const { error } = await supabase
                .from('system_settings')
                .upsert({ key: 'google_ai_key', value: apiKey.trim(), updated_at: new Date().toISOString() });
            if (error) throw error;
            setHasExistingKey(true);
            setApiKey('');
            setSaveResult('success');
        } catch {
            setSaveResult('error');
        } finally {
            setSaving(false);
            setTimeout(() => setSaveResult(null), 3000);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const { data, error } = await supabase.functions.invoke('ai-summary', {
                body: { testOnly: true },
            });
            if (error) {
                let detail = error.message;
                try {
                    const ctx = (error as any).context;
                    if (ctx) {
                        const body = await (ctx as Response).json();
                        detail = body?.error ?? detail;
                    }
                } catch { /* ignore */ }
                setTestResult({ ok: false, message: detail });
            } else if (data?.error) {
                setTestResult({ ok: false, message: data.error });
            } else {
                setTestResult({ ok: true, message: 'Connection successful — Gemini API is working.' });
            }
        } catch (err) {
            setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div style={{ maxWidth: '640px' }}>
            <div style={{
                backgroundColor: 'white',
                padding: '28px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
                {/* Header + toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '8px',
                            background: 'linear-gradient(135deg, #6b4cc3, #a855f7)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Sparkles size={18} color="white" />
                        </div>
                        <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                            AI Summary Feature
                        </h2>
                    </div>

                    {/* Toggle switch */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '13px', color: enabled ? '#6366f1' : '#94a3b8', fontWeight: 500 }}>
                            {enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <div
                            onClick={handleToggle}
                            style={{
                                width: '44px', height: '24px', borderRadius: '12px',
                                backgroundColor: enabled ? '#6366f1' : '#e2e8f0',
                                position: 'relative', cursor: 'pointer',
                                transition: 'background-color 0.2s ease',
                                flexShrink: 0,
                            }}
                        >
                            <div style={{
                                position: 'absolute',
                                top: '3px',
                                left: enabled ? '23px' : '3px',
                                width: '18px', height: '18px',
                                borderRadius: '50%',
                                backgroundColor: 'white',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                transition: 'left 0.2s ease',
                            }} />
                        </div>
                    </div>
                </div>
                <p style={{ fontSize: '13.5px', color: '#64748b', margin: '0 0 24px' }}>
                    When enabled, the <strong>✦ AI Summary</strong> tab appears in all board views. The API key is stored securely and never exposed to the browser.
                </p>

                {/* Status badge */}
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: '13px',
                    padding: '6px 12px', borderRadius: '20px', marginBottom: '20px',
                    backgroundColor: hasExistingKey ? '#f0fdf4' : '#f8fafc',
                    border: `1px solid ${hasExistingKey ? '#bbf7d0' : '#e2e8f0'}`,
                    color: hasExistingKey ? '#16a34a' : '#94a3b8',
                }}>
                    {hasExistingKey
                        ? <><CheckCircle size={13} /> API key is saved</>
                        : <><XCircle size={13} /> No API key saved</>}
                </div>

                {/* Key input */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
                        {hasExistingKey ? 'Replace API Key' : 'API Key'}
                    </label>
                    <div style={{ position: 'relative' }}>
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                            placeholder={hasExistingKey ? 'Enter new key to replace current...' : 'AIza...'}
                            style={{
                                width: '100%', padding: '10px 40px 10px 12px',
                                border: '1px solid #e2e8f0', borderRadius: '8px',
                                fontSize: '14px', fontFamily: 'monospace',
                                outline: 'none', boxSizing: 'border-box',
                                backgroundColor: '#fafafa',
                            }}
                        />
                        <button
                            onClick={() => setShowKey(v => !v)}
                            style={{
                                position: 'absolute', right: '10px', top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#94a3b8', display: 'flex', padding: '2px',
                            }}
                        >
                            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleSave}
                        disabled={!apiKey.trim() || saving}
                        style={{
                            padding: '9px 20px', borderRadius: '8px',
                            backgroundColor: apiKey.trim() ? '#6366f1' : '#e2e8f0',
                            color: apiKey.trim() ? 'white' : '#94a3b8',
                            border: 'none', fontSize: '14px', fontWeight: 600,
                            cursor: apiKey.trim() && !saving ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {saving ? 'Saving...' : 'Save Key'}
                    </button>

                    <button
                        onClick={handleTest}
                        disabled={!hasExistingKey || testing}
                        style={{
                            padding: '9px 20px', borderRadius: '8px',
                            backgroundColor: 'white',
                            color: hasExistingKey ? '#374151' : '#94a3b8',
                            border: '1px solid #e2e8f0',
                            fontSize: '14px', fontWeight: 500,
                            cursor: hasExistingKey && !testing ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                    >
                        {testing
                            ? <><Loader size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Testing...</>
                            : <><Sparkles size={14} /> Test Connection</>}
                    </button>

                    {saveResult === 'success' && (
                        <span style={{ fontSize: '13px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle size={14} /> Saved
                        </span>
                    )}
                    {saveResult === 'error' && (
                        <span style={{ fontSize: '13px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <XCircle size={14} /> Failed to save
                        </span>
                    )}
                </div>

                {/* Test result */}
                {testResult && (
                    <div style={{
                        marginTop: '16px', padding: '12px 16px', borderRadius: '8px',
                        backgroundColor: testResult.ok ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${testResult.ok ? '#bbf7d0' : '#fecaca'}`,
                        display: 'flex', alignItems: 'flex-start', gap: '8px',
                        fontSize: '13px',
                        color: testResult.ok ? '#15803d' : '#dc2626',
                    }}>
                        {testResult.ok
                            ? <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                            : <XCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />}
                        <span>{testResult.message}</span>
                    </div>
                )}
            </div>

            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '10px' }}>
                Get your API key at <strong>aistudio.google.com</strong> → Get API Key → Create API key in new project
            </p>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};
