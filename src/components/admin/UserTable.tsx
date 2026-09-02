import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../store/useUserStore';
import { Search, RefreshCw, MoreHorizontal, Trash2, Edit3, ArrowUp, ArrowDown, ArrowUpDown, Filter, ShieldCheck, UserPlus, Lock, FileSpreadsheet, Globe, Users } from 'lucide-react';
import * as XLSX from 'xlsx';
import { CreateUserModal } from './CreateUserModal';

interface Profile {
    id: string;
    email: string;
    full_name: string;
    system_role: 'user' | 'it_admin' | 'super_admin';
    is_approved: boolean;
    created_at: string;
    last_login_at: string | null;
    auth_type?: 'google' | 'internal';
    avatar_url?: string | null;
    is_active?: boolean;
}

const initialsFrom = (name?: string, email?: string) =>
    (name || email || '?').trim().charAt(0).toUpperCase();

const HEADER_ROW_HEIGHT = 44;

const thStyle: React.CSSProperties = {
    cursor: 'pointer',
    padding: '0 20px',
    height: `${HEADER_ROW_HEIGHT}px`,
    boxSizing: 'border-box',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    backgroundColor: '#f8fafc',
    zIndex: 2,
    borderBottom: '1px solid #e2e8f0'
};

const thFilterStyle: React.CSSProperties = {
    padding: '8px 20px',
    boxSizing: 'border-box',
    position: 'sticky',
    top: `${HEADER_ROW_HEIGHT}px`,
    backgroundColor: '#fcfdfe',
    zIndex: 2,
    borderBottom: '1px solid #e2e8f0'
};

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
    const [showCreateUserModal, setShowCreateUserModal] = useState(false);
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
        role: string;
        authType: 'google' | 'internal';
        isActive: boolean;
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
            const oldActive = targetUser?.is_active !== false;

            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: editProfileModal.fullName,
                    email: editProfileModal.email,
                    system_role: editProfileModal.role,
                    auth_type: editProfileModal.authType,
                    is_active: editProfileModal.isActive
                })
                .eq('id', editProfileModal.userId);

            if (error) throw error;

            // Deactivating someone revokes their access, so it belongs in the audit
            // trail next to role changes rather than passing silently.
            if (oldActive !== editProfileModal.isActive) {
                await supabase.rpc('log_activity', {
                    p_action_type: editProfileModal.isActive ? 'user_reactivated' : 'user_deactivated',
                    p_target_type: 'user',
                    p_target_id: editProfileModal.userId,
                    p_metadata: { target_email: editProfileModal.email }
                });
            }

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
                    system_role: editProfileModal.role as any,
                    auth_type: editProfileModal.authType,
                    is_active: editProfileModal.isActive
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

    const handleApproveUser = async (userId: string) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_approved: true })
                .eq('id', userId);

            if (error) throw error;

            setProfiles(prev => prev.map(p => 
                p.id === userId ? { ...p, is_approved: true } : p
            ));
            setOpenPopoverId(null);
            
            // Log activity
            const user = profiles.find(p => p.id === userId);
            await supabase.rpc('log_activity', {
                p_action_type: 'user_approved',
                p_target_type: 'user',
                p_target_id: userId,
                p_metadata: { email: user?.email }
            });

        } catch (err: any) {
            alert('Failed to approve user: ' + err.message);
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
                (p.is_approved ? 'approved' : 'pending').includes(columnFilters.status.toLowerCase());

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

    const exportToExcel = () => {
        const exportData = filteredAndSortedProfiles.map((p) => ({
            Name: p.full_name || 'Unknown',
            Email: p.email || '',
            Role: ROLE_LABELS[p.system_role] || p.system_role,
            Authentication: p.auth_type === 'internal' ? 'Internal' : 'Google',
            Status: p.is_approved ? 'Approved' : 'Pending',
            Active: p.is_active === false ? 'Inactive' : 'Active',
            'Last Login': p.last_login_at
                ? new Date(p.last_login_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true
                })
                : '-',
            'Created At': p.created_at
                ? new Date(p.created_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true
                })
                : '-',
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);

        // Set column widths
        ws['!cols'] = [
            { wch: 30 }, // Name
            { wch: 35 }, // Email
            { wch: 15 }, // Role
            { wch: 16 }, // Authentication
            { wch: 12 }, // Status
            { wch: 10 }, // Active
            { wch: 24 }, // Last Login
            { wch: 24 }, // Created At
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Users');

        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        XLSX.writeFile(wb, `user-list-${dateStr}.xlsx`);
    };

    return (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '200px' }}>
                    <Search size={18} color="#64748b" style={{ flexShrink: 0 }} />
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
                    {!isLoading && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0,
                            padding: '3px 10px', borderRadius: '999px', backgroundColor: '#f1f5f9',
                            fontSize: '12px', fontWeight: 600, color: '#475569'
                        }}>
                            <Users size={12} />
                            {filteredAndSortedProfiles.length}{filteredAndSortedProfiles.length !== profiles.length ? ` / ${profiles.length}` : ''}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setShowCreateUserModal(true)}
                        style={{
                            padding: '6px 14px',
                            backgroundColor: '#059669',
                            border: '1px solid #059669',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'white',
                            transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#047857'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                    >
                        <UserPlus size={14} />
                        Create User
                    </button>
                    <button
                        onClick={exportToExcel}
                        title={`Export ${filteredAndSortedProfiles.length} user(s) to Excel`}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: '#15803d',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#dcfce7';
                            e.currentTarget.style.borderColor = '#86efac';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#f0fdf4';
                            e.currentTarget.style.borderColor = '#bbf7d0';
                        }}
                    >
                        <FileSpreadsheet size={14} />
                        Export Excel
                    </button>
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
                            color: '#475569',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
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
            </div>

            {/* Table */}
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 340px)', minHeight: '200px' }}>
                {isLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8fafc' }}>
                                <th onClick={() => requestSort('full_name')} style={thStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Name {getSortIcon('full_name')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('email')} style={thStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Email {getSortIcon('email')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('system_role')} style={thStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Role {getSortIcon('system_role')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('status')} style={thStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Status {getSortIcon('status')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('last_login_at')} style={thStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Last Login {getSortIcon('last_login_at')}
                                    </div>
                                </th>
                                <th onClick={() => requestSort('auth_type')} style={thStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Authentication {getSortIcon('auth_type')}
                                    </div>
                                </th>
                                <th style={{ ...thStyle, cursor: 'default', textAlign: 'center' }}>Actions</th>
                            </tr>
                            {showFilters && (
                                <tr style={{ backgroundColor: '#fcfdfe' }}>
                                    <th style={thFilterStyle}>
                                        <input
                                            placeholder="Filter name..."
                                            value={columnFilters.full_name}
                                            onChange={(e) => setColumnFilters({ ...columnFilters, full_name: e.target.value })}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', boxSizing: 'border-box' }}
                                        />
                                    </th>
                                    <th style={thFilterStyle}>
                                        <input
                                            placeholder="Filter email..."
                                            value={columnFilters.email}
                                            onChange={(e) => setColumnFilters({ ...columnFilters, email: e.target.value })}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', boxSizing: 'border-box' }}
                                        />
                                    </th>
                                    <th style={thFilterStyle}>
                                        <select
                                            value={columnFilters.system_role}
                                            onChange={(e) => setColumnFilters({ ...columnFilters, system_role: e.target.value })}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: 'white', boxSizing: 'border-box' }}
                                        >
                                            <option value="">All Roles</option>
                                            <option value="user">User</option>
                                            <option value="it_admin">IT Admin</option>
                                            <option value="super_admin">Super Admin</option>
                                        </select>
                                    </th>
                                    <th style={thFilterStyle}>
                                        <select
                                            value={columnFilters.status}
                                            onChange={(e) => setColumnFilters({ ...columnFilters, status: e.target.value })}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: 'white', boxSizing: 'border-box' }}
                                        >
                                            <option value="">All Status</option>
                                            <option value="approved">Approved</option>
                                            <option value="pending">Pending</option>
                                        </select>
                                    </th>
                                    <th style={thFilterStyle}></th>
                                    <th style={thFilterStyle}></th>
                                    <th style={thFilterStyle}></th>
                                </tr>
                            )}
                        </thead>
                        <tbody>
                            {filteredAndSortedProfiles.map((profile, idx) => (
                                <tr
                                    key={profile.id}
                                    className="user-table-row"
                                    style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? 'white' : '#fafbfc' }}
                                >
                                    <td style={{ padding: '10px 20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{
                                                width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                                                backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '12px', fontWeight: 600, color: '#475569'
                                            }}>
                                                {profile.avatar_url ? (
                                                    <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : initialsFrom(profile.full_name, profile.email)}
                                            </div>
                                            <div style={{ fontWeight: 500, color: '#0f172a', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }} title={profile.full_name || 'Unknown'}>
                                                {profile.full_name || 'Unknown'}
                                            </div>
                                            {profile.is_active === false && (
                                                <span
                                                    title="Deactivated — signed out of the app and hidden from every board"
                                                    style={{
                                                        flexShrink: 0,
                                                        padding: '2px 8px',
                                                        borderRadius: '10px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        backgroundColor: '#fee2e2',
                                                        color: '#b91c1c',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    Inactive
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 20px' }}>
                                        <div style={{ fontSize: '14px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px' }} title={profile.email}>{profile.email}</div>
                                    </td>
                                    <td style={{ padding: '10px 20px' }}>
                                        <span style={{
                                            display: 'inline-block',
                                            padding: '4px 12px',
                                            borderRadius: '12px',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            whiteSpace: 'nowrap',
                                            backgroundColor: profile.system_role === 'super_admin' ? '#dbeafe' : profile.system_role === 'it_admin' ? '#fef3c7' : '#f1f5f9',
                                            color: profile.system_role === 'super_admin' ? '#1e40af' : profile.system_role === 'it_admin' ? '#92400e' : '#475569'
                                        }}>
                                            {ROLE_LABELS[profile.system_role] || profile.system_role}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 20px' }}>
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontSize: '13px',
                                            whiteSpace: 'nowrap',
                                            color: profile.is_approved ? '#10b981' : '#f59e0b',
                                            fontWeight: 500
                                        }}>
                                            <div style={{
                                                width: '6px',
                                                height: '6px',
                                                borderRadius: '50%',
                                                flexShrink: 0,
                                                backgroundColor: profile.is_approved ? '#10b981' : '#f59e0b'
                                            }} />
                                            {profile.is_approved ? 'Approved' : 'Pending'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 20px', fontSize: '13px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                        {profile.last_login_at ? new Date(profile.last_login_at).toLocaleString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            hour12: true
                                        }) : '-'}
                                    </td>
                                    <td style={{ padding: '10px 20px' }}>
                                        {profile.auth_type === 'internal' ? (
                                            <span title="Internal (email + password)" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', backgroundColor: '#f1f5f9', color: '#475569' }}>
                                                <Lock size={11} /> Internal
                                            </span>
                                        ) : (
                                            <span title="Google" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
                                                <Globe size={11} /> Google
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '10px 20px', position: 'relative', textAlign: 'center' }}>
                                        {(() => {
                                            // Don't show button for current user's own account
                                            if (profile.id === currentUser.id) {
                                                return <span style={{ fontSize: '12px', color: '#cbd5e1' }}>—</span>;
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
                                                                            role: profile.system_role,
                                                                            authType: profile.auth_type || 'google',
                                                                            isActive: profile.is_active !== false
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

                                                            {!profile.is_approved && (
                                                                <button
                                                                    onClick={() => handleApproveUser(profile.id)}
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
                                                                        color: '#10b981',
                                                                        transition: 'background-color 0.15s'
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ecfdf5'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                >
                                                                    <ShieldCheck size={16} />
                                                                    Approve User
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

            <style>{`
                .user-table-row:hover {
                    background-color: #eef2ff !important;
                }
            `}</style>

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

                            {/* Authentication */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>Authentication</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                    {(['google', 'internal'] as const).map((authType) => (
                                        <button
                                            key={authType}
                                            onClick={() => setEditProfileModal({ ...editProfileModal, authType })}
                                            style={{
                                                padding: '10px 8px',
                                                border: editProfileModal.authType === authType ? '2px solid #6366f1' : '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                backgroundColor: editProfileModal.authType === authType ? '#eef2ff' : 'white',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                color: editProfileModal.authType === authType ? '#4338ca' : '#64748b',
                                                transition: 'all 0.2s',
                                                textAlign: 'center'
                                            }}
                                        >
                                            {authType === 'google' ? 'Google' : 'Internal'}
                                        </button>
                                    ))}
                                </div>
                                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                                    {editProfileModal.authType === 'google'
                                        ? 'Signs in with Continue with Google.'
                                        : 'Signs in with email + a password. Switching this label alone does not send a setup email or change their existing credentials.'}
                                </p>
                            </div>

                            {/* Status */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>Status</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                    {([true, false] as const).map((active) => {
                                        const selected = editProfileModal.isActive === active;
                                        // Deactivating yourself would lock you out of the console on the
                                        // next load, with no way back in from inside the app.
                                        const isSelf = editProfileModal.userId === currentUser.id;
                                        const disabled = !active && isSelf;
                                        return (
                                            <button
                                                key={String(active)}
                                                onClick={() => !disabled && setEditProfileModal({ ...editProfileModal, isActive: active })}
                                                disabled={disabled}
                                                title={disabled ? "You can't deactivate your own account" : undefined}
                                                style={{
                                                    padding: '10px 8px',
                                                    border: selected ? `2px solid ${active ? '#10b981' : '#ef4444'}` : '1px solid #e2e8f0',
                                                    borderRadius: '8px',
                                                    backgroundColor: selected ? (active ? '#ecfdf5' : '#fef2f2') : 'white',
                                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                                    fontSize: '12px',
                                                    fontWeight: 500,
                                                    color: disabled ? '#cbd5e1' : selected ? (active ? '#047857' : '#b91c1c') : '#64748b',
                                                    transition: 'all 0.2s',
                                                    textAlign: 'center'
                                                }}
                                            >
                                                {active ? 'Active' : 'Inactive'}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                                    {editProfileModal.isActive
                                        ? 'Can sign in and appears in member lists, person columns and @mentions.'
                                        : 'Blocked from signing in and hidden from every workspace, board and person column. Nothing is deleted — switching back to Active restores them.'}
                                </p>
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

            {showCreateUserModal && (
                <CreateUserModal
                    onClose={() => setShowCreateUserModal(false)}
                    onCreated={fetchProfiles}
                />
            )}
        </div>
    );
};
