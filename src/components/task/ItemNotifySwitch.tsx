import { Bell, BellOff } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';

/**
 * The item's notification switch: off unless someone turns it on. When on, the
 * people in the item's Person column hear about changes to it, in the app and by
 * email. Sits at the end of the "Waiting on" bar in the item panel.
 */
export const ItemNotifySwitch = ({ itemId }: { itemId: string }) => {
    const on = useBoardStore(state => !!state.boards.flatMap(b => b.items).find(i => i.id === itemId)?.notifyEnabled);
    const setItemNotifications = useBoardStore(state => state.setItemNotifications);
    const { can } = usePermission();
    const canEdit = can('edit_items');
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={!canEdit}
            onClick={() => setItemNotifications(itemId, !on)}
            title={on
                ? 'On: the people in the Person column get an in-app notification and an email when this item changes'
                : 'Off: turn on to notify the people in the Person column (in the app and by email) when this item changes'}
            style={{
                marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: 'none', border: 'none', padding: '2px 0', cursor: canEdit ? 'pointer' : 'not-allowed',
                opacity: canEdit ? 1 : 0.6, color: on ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))',
                fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
            }}
        >
            {on ? <Bell size={14} /> : <BellOff size={14} />}
            Email notification
            <span aria-hidden="true" style={{
                position: 'relative', width: '32px', height: '18px', borderRadius: '9px', flexShrink: 0,
                background: on ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-border-strong, var(--color-border)))',
                transition: 'background-color 0.15s ease',
            }}>
                <span style={{
                    position: 'absolute', top: '2px', left: on ? '16px' : '2px', width: '14px', height: '14px', borderRadius: '50%',
                    background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', transition: 'left 0.15s ease',
                }} />
            </span>
        </button>
    );
};
