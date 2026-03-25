import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../store/useUserStore';
import { Search, RefreshCw, MoreHorizontal, Trash2, Edit3, ArrowUp, ArrowDown, ArrowUpDown, Filter } from 'lucide-react';

interface Profile {
    id: string;
    email: string;
    full_name: string;
    system_role: 'user' | 'it_admin' | 'super_admin';
    created_at: string;
    last_login_at: string | null;
}

const ROLE_HIERARCHY = {
    'user': 1,
    'it_admin': 2,
    'super_admin': 3
};

const ROLE_LABELS = {
    'user': 'User',
    'it_admin': 'IT Admin',
    'super_admin': 'Super Admin'
};

export const UserTable = () => {
    const { currentUser } = useUserStore();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ 
        key: keyof Profile | 'status' | null; 
        direction: 'asc' | 'desc' | null 
    }>({ key: 'created_at', direction: 'desc' });
    const [columnFilters, setColumnFilters] = useState({
        full_name: '',
        email: '',
        system_role: '',
        status: ''
    });

    // Popover State
    const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
    const [popoverOpenUpward, setPopoverOpenUpward] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Delete Confirmation State
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Edit Profile State
    const [editProfileModal, setEditProfileModal] = useState<{ 
        userId: string; 
        fullName: string; 
        email: string; 
        role: string 
    } | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const fetchProfiles = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setProfiles(data || []);
        } catch (err: any) {
            alert('Failed to fetch users: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProfiles();
    }, []);

    // Close popover when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setOpenPopoverId(null);
            }
        };

        if (openPopoverId) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [openPopoverId]);

    const handleProfileUpdate = async () => {
        if (!editProfileModal) return;
        
        setIsSaving(true);
        try {
            const targetUser = profiles.find(p => p.id === editProfileModal.userId);
            const oldRole = targetUser?.system_role;

            const { error } = await supabase
                .from('profiles')
                .update({ 
                    full_name: editProfileModal.fullName,
                    email: editProfileModal.email,
                    system_role: editProfileModal.role 
                })
                .eq('id', editProfileModal.userId);

            if (error) throw error;

            // Log the activity if role changed
            if (oldRole !== editProfileModal.role) {
                await supabase.rpc('log_activity', {
                    p_action_type: 'role_updated',
                    p_target_type: 'user',
                    p_target_id: editProfileModal.userId,
                    p_metadata: {
                        old_role: oldRole,
                        new_role: editProfileModal.role,
                        target_email: editProfileModal.email
                    }
                });
            }

            setProfiles(prev => prev.map(p =>
                p.id === editProfileModal.userId ? { 
                    ...p, 
                    full_name: editProfileModal.fullName,
                    email: editProfileModal.email,
                    system_role: editProfileModal.role as any 
                } : p
            ));
            setEditProfileModal(null);
            setOpenPopoverId(null);
        } catch (err: any) {
            alert('Failed to update profile: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        try {
            const { error } = await supabase.rpc('delete_user', { user_id: userId });

            if (error) throw error;

            setProfiles(prev => prev.filter(p => p.id !== userId));
            setDeleteConfirmId(null);
            setOpenPopoverId(null);
            alert('User deleted successfully');
        } catch (err: any) {
            alert('Failed to delete user: ' + err.message);
        }
    };

    const canModifyUser = (targetRole: string) => {
        const currentRoleLevel = ROLE_HIERARCHY[currentUser.system_role as keyof typeof ROLE_HIERARCHY] || 0;
        const targetRoleLevel = ROLE_HIERARCHY[targetRole as keyof typeof ROLE_HIERARCHY] || 0;
        return currentRoleLevel > targetRoleLevel;
    };

    const requestSort = (key: keyof Profile | 'status') => {
        let direction: 'asc' | 'desc' | null = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = null;
        }
        setSortConfig({ key: direction ? key : null, direction });
    };

    const getSortIcon = (key: keyof Profile | 'status') => {
        if (sortConfig.key !== key) return <ArrowUpDown size={14} style={{ opacity: 0.3 }} />;
        if (sortConfig.direction === 'asc') return <ArrowUp size={14} />;
        if (sortConfig.direction === 'desc') return <ArrowDown size={14} />;
        return <ArrowUpDown size={14} style={{ opacity: 0.3 }} />;
    };

    const filteredAndSortedProfiles = [...profiles]
        .filter(p => {
            // Global search
            const globalSearchMatch = searchQuery === '' ||
                p.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.full_name?.toLowerCase().includes(searchQuery.toLowerCase());

            // Column filters
            const nameMatch = columnFilters.full_name === '' || 
                p.full_name?.toLowerCase().includes(columnFilters.full_name.toLowerCase());
            const emailMatch = columnFilters.email === '' || 
                p.email?.toLowerCase().includes(columnFilters.email.toLowerCase());
            const roleMatch = columnFilters.system_role === '' || 
                p.system_role === columnFilters.system_role;
            const statusMatch = columnFilters.status === '' || 
                'active'.includes(columnFilters.status.toLowerCase()); // Since status is hardcoded as 'Active'

            return globalSearchMatch && nameMatch && emailMatch && roleMatch && statusMatch;
        })
        .sort((a, b) => {
            if (!sortConfig.key || !sortConfig.direction) return 0;

            let valA: any = a[sortConfig.key as keyof Profile];
            let valB: any = b[sortConfig.key as keyof Profile];

            if (sortConfig.key === 'system_role') {
                valA = ROLE_HIERARCHY[a.system_role] || 0;
                valB = ROLE_HIERARCHY[b.system_role] || 0;
            }

            if (sortConfig.key === 'status') {
                valA = 'Active';
                valB = 'Active';
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    return (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <Search size={18} color="#64748b" />
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '14px',
                            flex: 1,
                            color: '#0f172a'
                        }}
                    />
                </div>
                <button
                    onClick={fetchProfiles}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        color: '#475569'
                    }}
                >
                    <RefreshCw size={14} />
                    Refresh
                </button>
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: showFilters ? '#eef2ff' : '#f1f5f9',
                        border: '1px solid',
                        borderColor: showFilters ? '#6366f1' : '#e2e8f0',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        color: showFilters ? '#4338ca' : '#475569',
                        transition: 'all 0.2s'
                    }}
                >
                    <Filter size={14} />
                    {showFilters ? 'Hide Filters' : 'Filter'}
                </button>
            </div>

            {/* Table */}
            <div style={{ overflow: 'visible' }}>
                {isLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <th onClick={() => requestSort('full_name')} style={{ cursor: 'pointer', padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Name {getSortIcon('full_name')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('email')} style={{ cursor: 'pointer', padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Email {getSortIcon('email')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('system_role')} style={{ cursor: 'pointer', padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Role {getSortIcon('system_role')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('status')} style={{ cursor: 'pointer', padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Status {getSortIcon('status')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('last_login_at')} style={{ cursor: 'pointer', padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Last Log-in {getSortIcon('last_login_at')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('created_at')} style={{ cursor: 'pointer', padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Joined {getSortIcon('created_at')}
                                    </div>
                                </th>
                                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
                            </tr>
                            {showFilters && (
                                <tr style={{ backgroundColor: '#fcfdfe', borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={{ padding: '8px 24px' }}>
                                        <input 
                                            placeholder="Filter name..."
                                            value={columnFilters.full_name}
                                            onChange={(e) => setColumnFilters({ ...columnFilters, full_name: e.target.value })}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                        />
                                    </th>
                                    <th style={{ padding: '8px 24px' }}>
                                        <input 
                                            placeholder="Filter email..."
                                            value={columnFilters.email}
                                            onChange={(e) => setColumnFilters({ ...columnFilters, email: e.target.value })}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                        />
                                    </th>
                                    <th style={{ padding: '8px 24px' }}>
                                        <select 
                                            value={columnFilters.system_role}
                                            onChange={(e) => setColumnFilters({ ...columnFilters, system_role: e.target.value })}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: 'white' }}
                                        >
                                            <option value="">All Roles</option>
                                            <option value="user">User</option>
                                            <option value="it_admin">IT Admin</option>
                                            <option value="super_admin">Super Admin</option>
                                        </select>
                                    </th>
                                    <th style={{ padding: '8px 24px' }}>
                                        <input 
                                            placeholder="Filter status..."
                                            value={columnFilters.status}
                                            onChange={(e) => setColumnFilters({ ...columnFilters, status: e.target.value })}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                        />
                                    </th>
                                    <th style={{ padding: '8px 24px' }}></th>
                                    <th style={{ padding: '8px 24px' }}></th>
                                    <th style={{ padding: '8px 24px' }}></th>
                                </tr>
                            )}
                        </thead>
                        <tbody>
                            {filteredAndSortedProfiles.map((profile) => (
                                <tr key={profile.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '12px 24px' }}>
                                        <div style={{ fontWeight: 500, color: '#0f172a', fontSize: '14px' }}>{profile.full_name || 'Unknown'}</div>
                                    </td>
                                    <td style={{ padding: '12px 24px' }}>
                                        <div style={{ fontSize: '14px', color: '#64748b' }}>{profile.email}</div>
                                    </td>
                                    <td style={{ padding: '12px 24px' }}>
                                        <span style={{
                                            padding: '4px 12px',
                                            borderRadius: '12px',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            backgroundColor: profile.system_role === 'super_admin' ? '#dbeafe' : profile.system_role === 'it_admin' ? '#fef3c7' : '#f1f5f9',
                                            color: profile.system_role === 'super_admin' ? '#1e40af' : profile.system_role === 'it_admin' ? '#92400e' : '#475569'
                                        }}>
                                            {ROLE_LABELS[profile.system_role] || profile.system_role}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 24px' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#10b981' }}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                                            Active
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 24px', fontSize: '13px', color: '#64748b' }}>
                                        {profile.last_login_at ? new Date(profile.last_login_at).toLocaleString('en-US', { 
                                            month: 'short', 
                                            day: 'numeric', 
                                            year: 'numeric', 
                                            hour: 'numeric', 
                                            minute: '2-digit', 
                                            hour12: true 
                                        }) : '-'}
                                    </td>
                                    <td style={{ padding: '12px 24px', fontSize: '13px', color: '#64748b' }}>
                                        {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '-'}
                                    </td>
                                    <td style={{ padding: '12px 24px', position: 'relative' }}>
                                        {(() => {
                                            // Don't show button for current user's own account
                                            if (profile.id === currentUser.id) {
                                                return null;
                                            }

                                            const currentRoleLevel = ROLE_HIERARCHY[currentUser.system_role as keyof typeof ROLE_HIERARCHY] || 0;
                                            const targetRoleLevel = ROLE_HIERARCHY[profile.system_role as keyof typeof ROLE_HIERARCHY] || 0;
                                            const canModify = currentRoleLevel > targetRoleLevel;
                                            const isDisabled = currentRoleLevel < targetRoleLevel;

                                            return (
                                                <>
                                                    <button
                                                        onClick={(e) => {
                                                            if (isDisabled) return;

                                                            if (openPopoverId === profile.id) {
                                                                setOpenPopoverId(null);
                                                            } else {
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const spaceBelow = window.innerHeight - rect.bottom;
                                                                const spaceAbove = rect.top;

                                                                // If less than 250px space below, open upward
                                                                setPopoverOpenUpward(spaceBelow < 250 && spaceAbove > spaceBelow);
                                                                setOpenPopoverId(profile.id);
                                                            }
                                                        }}
                                                        disabled={isDisabled}
                                                        style={{
                                                            border: 'none',
                                                            background: 'transparent',
                                                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                            padding: '4px',
                                                            borderRadius: '4px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            opacity: isDisabled ? 0.4 : 1
                                                        }}
                                                    >
                                                        <MoreHorizontal size={16} color={isDisabled ? '#cbd5e1' : '#94a3b8'} />
                                                    </button>

                                                    {/* Popover Menu */}
                                                    {openPopoverId === profile.id && canModify && (
                                                        <div
                                                            ref={popoverRef}
                                                            style={{
                                                                position: 'absolute',
                                                                ...(popoverOpenUpward ? { bottom: '100%', marginBottom: '4px' } : { top: '100%', marginTop: '4px' }),
                                                                right: '0',
                                                                backgroundColor: 'white',
                                                                border: '1px solid #e2e8f0',
                                                                borderRadius: '8px',
                                                                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
                                                                zIndex: 9999,
                                                                minWidth: '200px',
                                                                overflow: 'hidden'
                                                            }}
                                                        >
                                                            {/* Edit Profile */}
                                                            {canModifyUser(profile.system_role) && (
                                                                <button
                                                                    onClick={() => {
                                                                        setEditProfileModal({ 
                                                                            userId: profile.id, 
                                                                            fullName: profile.full_name || '', 
                                                                            email: profile.email || '', 
                                                                            role: profile.system_role 
                                                                        });
                                                                        setOpenPopoverId(null);
                                                                    }}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '10px 16px',
                                                                        border: 'none',
                                                                        background: 'transparent',
                                                                        textAlign: 'left',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '10px',
                                                                        fontSize: '14px',
                                                                        color: '#0f172a',
                                                                        transition: 'background-color 0.15s'
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                >
                                                                    <Edit3 size={16} color="#64748b" />
                                                                    Edit Profile
                                                                </button>
                                                            )}



                                                            {/* Delete */}
                                                            {canModifyUser(profile.system_role) && (
                                                                <>
                                                                    <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }} />
                                                                    <button
                                                                        onClick={() => {
                                                                            setDeleteConfirmId(profile.id);
                                                                            setOpenPopoverId(null);
                                                                        }}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '10px 16px',
                                                                            border: 'none',
                                                                            background: 'transparent',
                                                                            textAlign: 'left',
                                                                            cursor: 'pointer',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '10px',
                                                                            fontSize: '14px',
                                                                            color: '#dc2626',
                                                                            transition: 'background-color 0.15s'
                                                                        }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                    >
                                                                        <Trash2 size={16} />
                                                                        Delete User
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Edit Profile Modal */}
            {editProfileModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '450px',
                        width: '90%',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
                                Edit Profile
                            </h3>
                            <button 
                                onClick={() => setEditProfileModal(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                            >
                                <MoreHorizontal size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                            {/* Full Name */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>Full Name</label>
                                <input 
                                    type="text"
                                    value={editProfileModal.fullName}
                                    onChange={(e) => setEditProfileModal({ ...editProfileModal, fullName: e.target.value })}
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '14px',
                                        outline: 'none',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                />
                            </div>

                            {/* Email */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>Email</label>
                                <input 
                                    type="email"
                                    value={editProfileModal.email}
                                    onChange={(e) => setEditProfileModal({ ...editProfileModal, email: e.target.value })}
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '14px',
                                        outline: 'none',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                />
                            </div>

                            {/* Role Selection */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>System Role</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                    {(['user', 'it_admin', 'super_admin'] as const).map((role) => (
                                        <button
                                            key={role}
                                            onClick={() => setEditProfileModal({ ...editProfileModal, role })}
                                            style={{
                                                padding: '10px 8px',
                                                border: editProfileModal.role === role ? '2px solid #6366f1' : '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                backgroundColor: editProfileModal.role === role ? '#eef2ff' : 'white',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                color: editProfileModal.role === role ? '#4338ca' : '#64748b',
                                                transition: 'all 0.2s',
                                                textAlign: 'center'
                                            }}
                                        >
                                            {ROLE_LABELS[role]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '30px' }}>
                            <button
                                onClick={() => setEditProfileModal(null)}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                    backgroundColor: 'white',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#475569',
                                    textAlign: 'center'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleProfileUpdate}
                                disabled={isSaving}
                                style={{
                                    flex: 1,
                                    padding: '10px 16px',
                                    border: 'none',
                                    borderRadius: '8px',
                                    backgroundColor: '#6366f1',
                                    color: 'white',
                                    cursor: isSaving ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    transition: 'background-color 0.2s',
                                    opacity: isSaving ? 0.7 : 1,
                                    textAlign: 'center'
                                }}
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '400px',
                        width: '90%'
                    }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
                            Confirm Delete User
                        </h3>
                        <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#64748b' }}>
                            Are you sure you want to delete this user? This action cannot be undone and will remove all their data.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setDeleteConfirmId(null)}
                                style={{
                                    padding: '8px 16px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    backgroundColor: 'white',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#475569'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteUser(deleteConfirmId)}
                                style={{
                                    padding: '8px 16px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    backgroundColor: '#dc2626',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500
                                }}
                            >
                                Delete User
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
