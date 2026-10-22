import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';
import { peopleOnItem } from '../../lib/itemPeople';

const Toggle = ({ on }: { on: boolean }) => (
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
);

/**
 * The item's notification control, at the end of the "Waiting on" bar: off for
 * everyone unless switched on, and chosen person by person from the people in the
 * item's Person column. The people switched on hear about changes to the item in
 * the app and by email (see itemSlice: status, updates, other fields).
 */
export const ItemNotifySwitch = ({ itemId }: { itemId: string }) => {
    const board = useBoardStore(state => state.boards.find(b => b.items.some(i => i.id === itemId)));
    const item = board?.items.find(i => i.id === itemId);
    const members = useBoardStore(state => state.activeBoardMembers);
    const setItemNotifyPeople = useBoardStore(state => state.setItemNotifyPeople);
    const { can } = usePermission();
    const canEdit = can('edit_items');

    const people = useMemo(() => peopleOnItem(board, item).map(id => {
        const member = members.find((m: any) => m.user_id === id);
        const profile = (Array.isArray(member?.profiles) ? member.profiles[0] : member?.profiles) || {};
        const name = profile.full_name || profile.email || 'Unknown';
        return { id, name, email: profile.email as string | undefined, avatar: profile.avatar_url as string | undefined };
    }), [board, item, members]);
    const on = new Set(item?.notifyUserIds || []);
    const onCount = people.filter(p => on.has(p.id)).length;

    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const toggleOpen = () => {
        if (!open && buttonRef.current) {
            const r = buttonRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
        }
        setOpen(v => !v);
    };

    const summary = onCount === 0 ? 'Off' : onCount === people.length ? 'On' : `${onCount} of ${people.length}`;
    const active = onCount > 0;
    const everyoneOn = people.length > 0 && onCount === people.length;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={toggleOpen}
                title="Choose who is notified (in the app and by email) when this item changes"
                style={{
                    marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none',
                    padding: '2px 0', cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
                    color: active ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))',
                }}
            >
                {active ? <Bell size={14} /> : <BellOff size={14} />}
                Email notification
                <span style={{
                    padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                    background: active ? 'hsl(var(--color-brand-light))' : 'hsl(var(--color-bg-subtle))',
                    color: active ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-tertiary))',
                }}>{summary}</span>
            </button>

            {open && pos && createPortal(
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-label="Who is notified"
                    style={{
                        position: 'fixed', top: pos.top, right: pos.right, width: 320, maxHeight: 'min(420px, 70vh)', overflowY: 'auto', zIndex: 100001,
                        background: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', borderRadius: '12px',
                        boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: '6px',
                    }}
                >
                    <div style={{ padding: '8px 10px 6px', fontSize: '12px', lineHeight: 1.4, color: 'hsl(var(--color-text-secondary))' }}>
                        <strong style={{ display: 'block', color: 'hsl(var(--color-text-primary))', fontSize: '13px' }}>Who is notified</strong>
                        People switched on get an in-app notification and an email when this item changes.
                    </div>

                    {people.length === 0 && (
                        <div style={{ padding: '12px 10px 14px', fontSize: '13px', color: 'hsl(var(--color-text-tertiary))' }}>
                            No one is in this item's Person column yet. Add someone there first.
                        </div>
                    )}

                    {people.map(person => {
                        const isOn = on.has(person.id);
                        return (
                            <button
                                key={person.id}
                                type="button"
                                role="switch"
                                aria-checked={isOn}
                                disabled={!canEdit}
                                onClick={() => setItemNotifyPeople(itemId, [person.id], !isOn)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '7px 10px', borderRadius: '8px',
                                    background: 'transparent', border: 'none', textAlign: 'left', cursor: canEdit ? 'pointer' : 'not-allowed', opacity: canEdit ? 1 : 0.6,
                                    color: 'hsl(var(--color-text-primary))',
                                }}
                                onMouseEnter={(e) => { if (canEdit) e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover, var(--color-bg-subtle)))'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                                <span style={{
                                    width: 28, height: 28, borderRadius: '28%', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: person.avatar ? 'transparent' : 'hsl(var(--color-brand-primary))', color: '#fff', fontSize: '12px', fontWeight: 600,
                                }}>
                                    {person.avatar
                                        ? <img src={person.avatar} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        : person.name.charAt(0).toUpperCase()}
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</span>
                                    {person.email && person.email !== person.name && (
                                        <span style={{ display: 'block', fontSize: '11px', color: 'hsl(var(--color-text-tertiary))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.email}</span>
                                    )}
                                </span>
                                <Toggle on={isOn} />
                            </button>
                        );
                    })}

                    {people.length > 1 && canEdit && (
                        <div style={{ padding: '6px 10px 8px', borderTop: '1px solid hsl(var(--color-border))', marginTop: '4px' }}>
                            <button
                                type="button"
                                onClick={() => setItemNotifyPeople(itemId, people.map(p => p.id), !everyoneOn)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontSize: '12px', fontWeight: 600, color: 'hsl(var(--color-brand-primary))' }}
                            >
                                {everyoneOn ? 'Turn off for everyone' : 'Turn on for everyone'}
                            </button>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </>
    );
};
