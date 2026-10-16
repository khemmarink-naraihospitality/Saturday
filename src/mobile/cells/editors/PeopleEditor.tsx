import { useEffect, useMemo, useState } from 'react';
import { Check, Mail, Search, UserPlus } from 'lucide-react';
import { useBoardStore } from '../../../store/useBoardStore';
import { Avatar, BottomSheet, PrimaryButton, TextButton, Spinner, mobileToast, peopleIds, useBoardPeople } from '../../ui';
import type { EditorProps } from './types';

interface Candidate {
    id: string;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A person column: the board's people with a tick on whoever is assigned; a
 * tap assigns or unassigns (assignMemberToItem, which also notifies and emails
 * the person, as on desktop). Searching reaches everyone in the system: someone
 * not on the board is offered the board first (viewer or editor), and an
 * address nobody has yet is invited by email — the desktop PersonPicker's rules.
 */
export const PeopleEditor = ({ open, onClose, board, item, column, value }: EditorProps) => {
    const assignMemberToItem = useBoardStore(state => state.assignMemberToItem);
    const inviteAndAssignUser = useBoardStore(state => state.inviteAndAssignUser);
    const inviteNewEmailToItem = useBoardStore(state => state.inviteNewEmailToItem);
    const searchUsers = useBoardStore(state => state.searchUsers);
    const people = useBoardPeople();

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Candidate[]>([]);
    const [searching, setSearching] = useState(false);
    const [inviting, setInviting] = useState<Candidate | null>(null);
    const [role, setRole] = useState<'viewer' | 'member'>('viewer');

    useEffect(() => {
        if (!open) return;
        setQuery('');
        setInviting(null);
        setRole('viewer');
    }, [open]);

    const assigned = new Set(peopleIds(value));
    const q = query.trim().toLowerCase();

    // Assigned people first, then everyone else on the board, by name.
    const members = useMemo(() => {
        const list = [...people.values()].filter(p => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
        return list.sort((a, b) => Number(assigned.has(b.id)) - Number(assigned.has(a.id)) || a.name.localeCompare(b.name));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [people, q, value]);

    // Everyone else in the system who matches, once something is typed.
    useEffect(() => {
        if (!q) {
            setResults([]);
            return;
        }
        let stale = false;
        setSearching(true);
        const timer = window.setTimeout(async () => {
            const users: Candidate[] = (await searchUsers(q)) || [];
            if (stale) return;
            setResults(users.filter(u => !people.has(u.id)));
            setSearching(false);
        }, 300);
        return () => {
            stale = true;
            window.clearTimeout(timer);
        };
    }, [q, people, searchUsers]);

    const toggle = (userId: string) => void assignMemberToItem(board.id, userId, item.id, column.id);

    const confirmInvite = async () => {
        const target = inviting;
        if (!target) return;
        setInviting(null);
        onClose();
        await inviteAndAssignUser(board.id, target.id, role, item.id, column.id);
        mobileToast(`${target.full_name || target.email} can now see this board`);
    };

    const inviteEmail = async () => {
        const email = query.trim();
        onClose();
        await inviteNewEmailToItem(board.id, email, 'viewer', item.id, column.id);
        mobileToast(`Invitation sent to ${email}`);
    };

    const knownEmail = [...people.values()].some(p => p.email.toLowerCase() === q) || results.some(r => (r.email || '').toLowerCase() === q);
    const canInviteEmail = EMAIL.test(query.trim()) && !knownEmail;

    if (inviting) {
        const name = inviting.full_name || inviting.email || 'This person';
        return (
            // The back gesture closes the whole sheet (it owns one history entry); "Back" returns to the list.
            <BottomSheet open={open} onClose={onClose} title="Share this board?" testId="m-cell-editor">
                <div className="m-editor-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="m-invite">
                        <Avatar name={name} src={inviting.avatar_url} size={44} />
                        <div style={{ minWidth: 0 }}>
                            <div className="m-truncate" style={{ fontWeight: 600, fontSize: 16.5 }}>{name}</div>
                            <div style={{ fontSize: 14.5, color: 'hsl(var(--m-text-2))' }}>isn't on “{board.title}” yet. Share the board to assign them.</div>
                        </div>
                    </div>
                    <div className="m-segmented" role="radiogroup" aria-label="Access">
                        {(['viewer', 'member'] as const).map(r => (
                            <button key={r} type="button" role="radio" aria-checked={role === r} className={`m-segmented__item${role === r ? ' m-segmented__item--active' : ''}`} onClick={() => setRole(r)}>
                                {r === 'viewer' ? 'Viewer (read only)' : 'Editor'}
                            </button>
                        ))}
                    </div>
                    <PrimaryButton onClick={() => void confirmInvite()}>Share & assign</PrimaryButton>
                    <TextButton onClick={() => setInviting(null)} style={{ alignSelf: 'center' }}>Back</TextButton>
                </div>
            </BottomSheet>
        );
    }

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={column.title}
            size="tall"
            headerRight={<TextButton onClick={onClose} style={{ fontWeight: 600 }}>Done</TextButton>}
            testId="m-cell-editor"
        >
            <div className="m-editor-pad">
                <label className="m-editor-search">
                    <Search size={18} />
                    <input
                        type="search"
                        inputMode="email"
                        enterKeyHint="search"
                        placeholder="Search names or emails"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search people"
                    />
                </label>

                <div className="m-check-list">
                    {members.map(person => {
                        const on = assigned.has(person.id);
                        return (
                            <button key={person.id} type="button" className="m-person-row" onClick={() => toggle(person.id)} aria-pressed={on}>
                                <Avatar name={person.name} src={person.avatarUrl} size={38} />
                                <span className="m-person-row__text">
                                    <span className="m-truncate">{person.name}</span>
                                    {person.email && <span className="m-truncate m-person-row__email">{person.email}</span>}
                                </span>
                                <span className={`m-check-row__box${on ? ' m-check-row__box--on' : ''}`}>{on && <Check size={16} strokeWidth={3} />}</span>
                            </button>
                        );
                    })}
                    {members.length === 0 && !q && <div className="m-empty">No one has been added to this board yet.</div>}

                    {q && (results.length > 0 || searching) && <div className="m-check-list__label">Not on this board</div>}
                    {results.map(user => (
                        <button key={user.id} type="button" className="m-person-row" onClick={() => setInviting(user)}>
                            <Avatar name={user.full_name || user.email} src={user.avatar_url} size={38} />
                            <span className="m-person-row__text">
                                <span className="m-truncate">{user.full_name || user.email}</span>
                                {user.email && <span className="m-truncate m-person-row__email">{user.email}</span>}
                            </span>
                            <UserPlus size={20} color="hsl(var(--m-accent))" />
                        </button>
                    ))}
                    {q && searching && results.length === 0 && <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><Spinner /></div>}

                    {canInviteEmail && !searching && (
                        <button type="button" className="m-person-row" onClick={() => void inviteEmail()}>
                            <span className="m-person-row__mail"><Mail size={19} /></span>
                            <span className="m-person-row__text">
                                <span className="m-truncate">Invite {query.trim()}</span>
                                <span className="m-person-row__email">Sends an invitation and assigns them</span>
                            </span>
                        </button>
                    )}
                    {q && !searching && members.length === 0 && results.length === 0 && !canInviteEmail && (
                        <div className="m-empty">No one matches “{query.trim()}”. Type a full email address to invite someone new.</div>
                    )}
                </div>
            </div>
        </BottomSheet>
    );
};
