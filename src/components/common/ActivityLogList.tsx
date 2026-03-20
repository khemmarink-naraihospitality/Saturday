import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { RefreshCw } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';

export interface ActivityLogListProps {
    scope: 'global' | 'board' | 'item';
    targetId?: string;
    maxHeight?: string;
    showHeader?: boolean;
    onClose?: () => void;
}

interface ActivityLog {
    id: string;
    created_at: string;
    actor_id: string | null;
    action_type: string;
    target_type: string | null;
    target_id: string | null;
    metadata: any;
    actor_name?: string;
    actor_email?: string;
    actor_avatar?: string;
}


const ACTION_LABELS: Record<string, string> = {
    user_signup: 'User Signup',
    role_updated: 'Role Updated',
    user_deleted: 'User Deleted',
    workspace_created: 'Workspace Created',
    board_created: 'Board Created',

    group_created: 'Group Created',
    group_deleted: 'Group Deleted',
    group_renamed: 'Group Renamed',

    column_created: 'Column Added',
    column_deleted: 'Column Deleted',

    item_created: 'Task Created',
    item_deleted: 'Task Deleted',
    item_renamed: 'Task Renamed',
    item_status_updated: 'Status Changed',
    item_value_updated: 'Item Updated',
    item_comment_added: 'Update Posted',
};

const ActivityLogItem = ({ log, onClickTask }: { log: ActivityLog; onClickTask: (id: string) => void }) => {
    const [imgError, setImgError] = useState(false);

    const { action_type, metadata, actor_name, actor_email, actor_avatar, created_at } = log;
    // const Icon = ACTION_ICONS[action_type] || User; // Default fallback? Activity symbol maybe
    const label = ACTION_LABELS[action_type] || action_type.replace(/_/g, ' ');

    // Helper: Truncate
    const truncate = (str: string, length: number = 50) => {
        if (!str) return '';
        return str.length > length ? str.substring(0, length) + '...' : str;
    };

    // Helper: Description Renderer
    const renderDescription = () => {
        const meta = metadata || {};
        const itemTitle = meta.item_title ? `"${meta.item_title}"` : 'this task';

        // Helper to format generic values
        const formatVal = (val: any) => {
            if (val === null || val === undefined || val === '') return 'Empty';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
        };

        const formatDate = (dateStr: string) => {
            if (!dateStr) return 'Empty';
            try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
            catch (e) { return dateStr; }
        };

        switch (action_type) {
            case 'item_value_updated': {
                const colType = meta.column_type;
                const colName = meta.column_title;

                if (colType === 'date') {
                    const dateVal = formatDate(meta.new_value);
                    return <span>Set <strong>{colName}</strong> to <em>{dateVal}</em> in <strong>{itemTitle}</strong></span>;
                }
                if (colType === 'timeline') {
                    const fromDate = formatDate(meta.new_value?.from);
                    const toDate = formatDate(meta.new_value?.to);
                    return <span>Set <strong>{colName}</strong> from <em>{fromDate}</em> to <em>{toDate}</em> in <strong>{itemTitle}</strong></span>;
                }
                if (colType === 'text') {
                    return <span>Updated <strong>{colName}</strong> to "{truncate(formatVal(meta.new_value), 60)}" in <strong>{itemTitle}</strong></span>;
                }
                if (colType === 'link') {
                    return <span>Updated Link <strong>{colName}</strong> in <strong>{itemTitle}</strong></span>;
                }
                if (colType === 'people') {
                    return <span>Updated Person in <strong>{colName}</strong> for <strong>{itemTitle}</strong></span>;
                }
                if (colType === 'files') {
                    const added = meta.added_files || [];
                    const removed = meta.removed_files || [];
                    const parts = [];
                    if (added.length > 0) parts.push(`Added ${added.length > 1 ? `${added.length} files` : `"${truncate(added[0], 20)}"`}`);
                    if (removed.length > 0) parts.push(`Removed ${removed.length > 1 ? `${removed.length} files` : `"${truncate(removed[0], 20)}"`}`);
                    const actionText = parts.join(' and ') || 'Updated files';

                    return <span>{actionText} in <strong>{colName}</strong> for <strong>{itemTitle}</strong></span>;
                }
                // Checkbox
                if (colType === 'checkbox') {
                    return <span>{meta.new_value ? 'Checked' : 'Unchecked'} <strong>{colName}</strong> in <strong>{itemTitle}</strong></span>;
                }
                // Dropdown (Fixed labels)
                if (colType === 'dropdown' || colType === 'status') {
                    return <span>Selected <strong>{meta.new_label}</strong> in <strong>{colName}</strong> for <strong>{itemTitle}</strong></span>;
                }

                // Fallback generic
                return <span>Updated <strong>{colName}</strong> in <strong>{itemTitle}</strong></span>;
            }

            case 'item_status_updated':
                return (
                    <span>
                        Changed status of <strong>{itemTitle}</strong> from <span style={{ backgroundColor: meta.old_color || '#eee', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', color: '#333' }}>{meta.old_label || 'None'}</span> to <span style={{ backgroundColor: meta.new_color || '#eee', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', color: '#333' }}>{meta.new_label}</span>
                    </span>
                );
            case 'item_created':
                return <span>Created task <strong>{itemTitle}</strong> in group <strong>{meta.group_title || 'Unknown Group'}</strong></span>;
            case 'item_renamed':
                return <span>Renamed task to <strong>{itemTitle}</strong></span>;
            case 'item_deleted':
                return <span>Deleted task <strong>{meta.item_title}</strong></span>;
            case 'item_comment_added':
                return <span>Posted an update on <strong>{itemTitle}</strong></span>;

            // ... system events ...
            default:
                return <span>{action_type.replace(/_/g, ' ')}</span>;
        }
    };

    // Determine if clickable
    const itemId = log.target_type === 'item' ? log.target_id : log.metadata?.item_id;
    const isClickable = !!itemId;

    const handleClick = (e: React.MouseEvent) => {
        if (isClickable) {
            e.stopPropagation();
            onClickTask(itemId!);
        }
    };

    return (
        <div
            onClick={handleClick}
            style={{
                display: 'flex',
                gap: '12px',
                padding: '16px',
                // borderBottom: '1px solid hsl(var(--color-border))', // Removed border
                fontSize: '13px',
                color: 'hsl(var(--color-text-primary))',
                cursor: isClickable ? 'pointer' : 'default',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                borderRadius: '8px',
                backgroundColor: '#fff', // White Card
                marginBottom: '8px', // Spacing
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)', // Subtle shadow
            }}
            onMouseEnter={(e) => isClickable && (e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))')}
            onMouseLeave={(e) => isClickable && (e.currentTarget.style.backgroundColor = 'transparent')}
        >
            {/* Avatar */}
            <div style={{ flexShrink: 0 }}>
                <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    backgroundColor: '#e5e7eb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                    fontSize: '12px', fontWeight: 600, color: '#4b5563'
                }}>
                    {actor_avatar && !imgError ? (
                        <img
                            src={actor_avatar}
                            alt=""
                            referrerPolicy="no-referrer"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        (actor_name || actor_email || '?').substring(0, 1).toUpperCase()
                    )}
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>
                        {actor_name || actor_email || 'Unknown User'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'hsl(var(--color-text-tertiary))' }}>
                        {new Date(created_at).toLocaleString()}
                    </span>
                </div>

                <div style={{ fontWeight: 600, color: '#374151', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {label}
                </div>

                <div style={{ color: 'hsl(var(--color-text-secondary))', lineHeight: '1.5' }}>
                    {renderDescription()}
                </div>
            </div>
        </div>
    );
};

export const ActivityLogList = ({ scope, targetId, showHeader = true, onClose }: ActivityLogListProps) => {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // const { setActiveItem, setHighlightedItem } = useBoardStore();

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {


            // STRICT SCOPE CHECK: Prevent global leak
            if (scope !== 'global' && !targetId) {
                setLoading(false);
                return;
            }

            let query = supabase
                .from('activity_logs')
                .select(`
                    *,
                    profiles!activity_logs_actor_id_fkey (
                        full_name,
                        email,
                        avatar_url
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(100);

            // Apply Filters based on scope
            if (scope === 'board') {
                // Board Log: STRICTLY filter by board_id in metadata or target_id
                // Use a more specific filter to avoid leaking other boards
                query = query.or(`target_id.eq.${targetId},metadata->>board_id.eq.${targetId}`);
            } else if (scope === 'item') {
                // Item Log: STRICTLY item events
                query = query.eq('target_id', targetId);
            }
            // scope === 'global' falls through (fetches everything)

            const { data, error: fetchError } = await query;

            if (fetchError) throw fetchError;

            const mapped: ActivityLog[] = (data || []).map((log: any) => ({
                ...log,
                actor_name: log.profiles?.full_name || 'System',
                actor_email: log.profiles?.email || 'N/A',
                actor_avatar: log.profiles?.avatar_url
            }));

            setLogs(mapped);
        } catch (err: any) {
            console.error('Error fetching logs:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (targetId || scope === 'global') {
            fetchLogs();
        }
    }, [scope, targetId]);

    const handleTaskClick = (itemId: string) => {
        useBoardStore.getState().setHighlightedItem(itemId);
        onClose && onClose();
    };

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'white'
        }}>
            {showHeader && (
                <div style={{
                    padding: '12px 0',
                    borderBottom: '1px solid hsl(var(--color-border))',
                    fontWeight: 600,
                    color: 'hsl(var(--color-text-primary))',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <span>Activity Log</span>
                    <button
                        onClick={fetchLogs}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                        title="Refresh"
                    >
                        <RefreshCw size={14} color="hsl(var(--color-text-tertiary))" />
                    </button>
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', minHeight: '200px', backgroundColor: '#f7f9fa', padding: '12px' }}>
                {loading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))' }}>
                        Loading activities...
                    </div>
                ) : error ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#ef4444' }}>
                        Error: {error}
                    </div>
                ) : logs.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))' }}>
                        No recent activity.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {logs.map(log => (
                            <ActivityLogItem key={log.id} log={log} onClickTask={handleTaskClick} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
