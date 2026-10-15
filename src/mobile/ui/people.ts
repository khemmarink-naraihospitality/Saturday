import { useMemo } from 'react';
import { useBoardStore } from '../../store/useBoardStore';

/** One person as the phone layout draws them. */
export interface PersonInfo {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
}

/**
 * A board_members / workspace_members row (with its joined `profiles`, which
 * PostgREST returns as an object or a one-element array) as a PersonInfo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const personFromMember = (member: any): PersonInfo | null => {
    if (!member?.user_id) return null;
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    return {
        id: member.user_id,
        name: profile?.full_name || profile?.email || 'Unknown user',
        email: profile?.email || '',
        avatarUrl: profile?.avatar_url || null
    };
};

/**
 * The open board's members, by user id. A person column only draws people who
 * resolve here — someone removed from the board or deactivated is left out
 * rather than shown as "Unknown", the same rule as the desktop PeopleCell.
 */
export const useBoardPeople = (): Map<string, PersonInfo> => {
    const members = useBoardStore(state => state.activeBoardMembers);
    return useMemo(() => {
        const map = new Map<string, PersonInfo>();
        members.forEach(member => {
            const person = personFromMember(member);
            if (person) map.set(person.id, person);
        });
        return map;
    }, [members]);
};

/** A person column's stored value (one id or a list) as a list of ids. */
export const peopleIds = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : (typeof value === 'string' && value ? [value] : []);
