export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export interface User {
    id: string;
    name: string;
    email?: string;
    avatar: string; // URL or Initials
    role: Role;
    system_role?: 'super_admin' | 'it_admin' | 'user';
    is_approved?: boolean;
    /** Deactivated accounts are hidden from everyone else and blocked from signing in. */
    is_active?: boolean;
}
