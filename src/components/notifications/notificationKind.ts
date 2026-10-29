import { Bell, CalendarClock, FileText, MessageSquare, RefreshCw, ThumbsUp, UserPlus, type LucideIcon } from 'lucide-react';
import { termsFor, type Terms } from '../../lib/terms';

export interface NotificationKind {
    Icon: LucideIcon;
    /** The symbol's colour (any CSS colour) */
    tone: string;
    /** A short name for the kind, shown where a notification has no title of its own */
    label: string;
}

const BRAND = 'hsl(var(--color-brand-primary))';
const NEUTRAL = 'hsl(var(--color-text-secondary))';

/**
 * How each kind of notification is drawn: its symbol, that symbol's colour and
 * a short name. Shared by the bell's list (NotificationItem) and the Home
 * page's Update feed, so one kind looks the same in both. `t` words the
 * names (src/lib/terms.ts); left out, they are Saturday's.
 */
export const notificationKind = (type: string, t: Terms = termsFor('saturday')): NotificationKind => {
    switch (type) {
        case 'workspace_invite': return { Icon: UserPlus, tone: BRAND, label: `${t.Workspace} invitation` };
        case 'board_invite': return { Icon: UserPlus, tone: BRAND, label: `${t.Board} invitation` };
        case 'assignment': return { Icon: FileText, tone: 'hsl(var(--color-status-green-bg))', label: 'Assigned to you' };
        case 'mention': return { Icon: MessageSquare, tone: '#f97316', label: 'Mention' };
        case 'comment': return { Icon: MessageSquare, tone: NEUTRAL, label: t.Update };
        case 'like': return { Icon: ThumbsUp, tone: '#D4A000', label: 'Like' };
        case 'due_date_reminder': return { Icon: CalendarClock, tone: '#e2445c', label: 'Due date' };
        case 'status_update': return { Icon: RefreshCw, tone: BRAND, label: 'Status change' };
        case 'item_change': return { Icon: RefreshCw, tone: BRAND, label: `${t.Item} change` };
        case 'access_granted': return { Icon: Bell, tone: NEUTRAL, label: 'Access granted' };
        case 'board_added': return { Icon: Bell, tone: NEUTRAL, label: `Added to a ${t.board}` };
        case 'workspace_added': return { Icon: Bell, tone: NEUTRAL, label: `Added to a ${t.workspace}` };
        default: return { Icon: Bell, tone: NEUTRAL, label: 'Notification' };
    }
};
