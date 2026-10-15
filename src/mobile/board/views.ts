import { CalendarDays, GanttChartSquare, KanbanSquare, Sparkles, Table2, type LucideIcon } from 'lucide-react';

/** The board views a phone can switch between — the desktop's own set. */
export const VIEW_OPTIONS: { id: string; label: string; icon: LucideIcon }[] = [
    { id: 'main_table', label: 'Main Table', icon: Table2 },
    { id: 'timeline', label: 'Timeline', icon: GanttChartSquare },
    { id: 'kanban', label: 'Kanban', icon: KanbanSquare },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'ai_summary', label: 'AI Summary', icon: Sparkles },
];
