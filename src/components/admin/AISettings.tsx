import { useState, useEffect } from 'react';
import { Sparkles, Eye, EyeOff, CheckCircle, XCircle, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { setGeminiEnabled } from '../../hooks/useGeminiEnabled';

export const AISettings = () => {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [hasExistingKey, setHasExistingKey] = useState(false);
    // A Gemini key starts "AIza"; anything else saved here is passed over for the server's own key.
    const [keyLooksReal, setKeyLooksReal] = useState(true);
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
                const saved = String(data?.find(r => r.key === 'google_ai_key')?.value ?? '').trim();
                setHasExistingKey(!!saved);
                setKeyLooksReal(!saved || /^AIza[\w-]{30,}$/.test(saved));
                setEnabled(String(data?.find(r => r.key === 'ai_summary_enabled')?.value) === 'true');
            });
    }, []);

    const handleToggle = async () => {
        const next = !enabled;
        setEnabled(next);
        // Open boards' AI Summary follows straight away.
        setGeminiEnabled(next);
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
            setKeyLooksReal(/^AIza[\w-]{30,}$/.test(apiKey.trim()));
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
                body: { mode: 'test', testOnly: true },
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
                setTestResult({ ok: true, message: data?.modelName ? `Connection works: ${data.modelName} answered, on the free tier.` : 'Connection works.' });
            }
        } catch (err) {
            setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div style={{ maxWidth: '640px' }}>
            <div className="card-surface" style={{ padding: '28px' }}>
                {/* Header + toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '28%',
                            background: 'linear-gradient(135deg, #6b4cc3, #a855f7)',
                            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 14px -6px rgba(107, 76, 195, 0.7)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Sparkles size={18} color="white" />
                        </div>
                        <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                            Gemini in AI Summary
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
                    Every board has an <strong>AI Summary</strong> tab. Its first section is worked out in the app and sends nothing anywhere. When this is on, its second section can send a board's tasks and comments to Google's Gemini API (free tier) to write a summary. Private boards are never sent. The key is used only on the server.
                </p>

                {/* Status badge */}
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: '13px',
                    padding: '6px 12px', borderRadius: '20px', marginBottom: '20px',
                    backgroundColor: hasExistingKey && keyLooksReal ? '#f0fdf4' : hasExistingKey ? '#fffbeb' : '#f8fafc',
                    border: `1px solid ${hasExistingKey && keyLooksReal ? '#bbf7d0' : hasExistingKey ? '#fde68a' : '#e2e8f0'}`,
                    color: hasExistingKey && keyLooksReal ? '#16a34a' : hasExistingKey ? '#b45309' : '#94a3b8',
                }}>
                    {hasExistingKey && keyLooksReal
                        ? <><CheckCircle size={13} /> API key is saved</>
                        : hasExistingKey
                            ? <><XCircle size={13} /> The saved key isn't a Gemini key (they start with AIza), so the server's own key is used</>
                            : <><XCircle size={13} /> No API key saved here: the server's own key is used, if it has one</>}
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
                        disabled={testing}
                        style={{
                            padding: '9px 20px', borderRadius: '8px',
                            backgroundColor: 'white',
                            color: '#374151',
                            border: '1px solid #e2e8f0',
                            fontSize: '14px', fontWeight: 500,
                            cursor: !testing ? 'pointer' : 'not-allowed',
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

            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '10px', lineHeight: 1.6 }}>
                Free tier: get a key at <strong>aistudio.google.com</strong> → Get API key → Create API key, in a Google Cloud project with no billing account linked. That keeps it free, within Google's limits (if they are reached, people are asked to try again later). On the free tier Google may use what is sent to improve its products.
            </p>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};
