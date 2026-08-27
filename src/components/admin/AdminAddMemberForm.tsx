import { useState, useRef } from 'react';
import { UserPlus } from 'lucide-react';
import { RoleSelector } from '../workspace/RoleSelector';
import { useBoardStore } from '../../store/useBoardStore';

interface AdminAddMemberFormProps {
    onAdd: (userId: string, role: string) => Promise<void>;
}

export const AdminAddMemberForm = ({ onAdd }: AdminAddMemberFormProps) => {
    const searchUsers = useBoardStore(state => state.searchUsers);
    const [query, setQuery] = useState('');
    const [role, setRole] = useState('member');
    const [selectedUser, setSelectedUser] = useState<any | null>(null);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const searchTimeoutRef = useRef<any>(null);

    const handleSearch = (value: string) => {
        setQuery(value);
        setSelectedUser(null);

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        if (!value.trim()) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        searchTimeoutRef.current = setTimeout(async () => {
            const results = await searchUsers(value);
            setSuggestions(results);
            setShowSuggestions(results.length > 0);
        }, 300);
    };

    const handleSelectUser = (user: any) => {
        setSelectedUser(user);
        setQuery(`${user.full_name || user.email} (${user.email})`);
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;

        setIsLoading(true);
        try {
            await onAdd(selectedUser.id, role);
            setQuery('');
            setSelectedUser(null);
            setRole('member');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <form onSubmit={handleSubmit} style={{
                display: 'flex',
                gap: '8px',
                padding: '12px 20px',
                borderBottom: '1px solid hsl(var(--color-border))'
            }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Search existing user by name or email"
                        disabled={isLoading}
                        autoComplete="off"
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '4px',
                            fontSize: '14px',
                            outline: 'none'
                        }}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        onFocus={() => query && suggestions.length > 0 && setShowSuggestions(true)}
                    />

                    {showSuggestions && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            backgroundColor: 'white',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '4px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            zIndex: 10,
                            marginTop: '4px',
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            {suggestions.map(user => (
                                <div
                                    key={user.id}
                                    onClick={() => handleSelectUser(user)}
                                    style={{
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        borderBottom: '1px solid #f0f0f0'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f7fa'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                >
                                    {user.avatar_url ? (
                                        <img src={user.avatar_url} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                                    ) : (
                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                                            {(user.full_name?.[0] || user.email?.[0] || '?').toUpperCase()}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 500 }}>{user.full_name}</span>
                                        <span style={{ fontSize: '12px', color: '#666' }}>{user.email}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <RoleSelector
                    value={role}
                    onChange={setRole}
                    disabled={isLoading}
                    type="board"
                    allowedRoles={['viewer', 'member', 'admin']}
                />

                <button
                    type="submit"
                    disabled={isLoading || !selectedUser}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: isLoading || !selectedUser ? '#ccc' : 'hsl(var(--color-brand-primary))',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: isLoading || !selectedUser ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <UserPlus size={14} />
                    {isLoading ? 'Adding...' : 'Add'}
                </button>
            </form>
        </div>
    );
};
