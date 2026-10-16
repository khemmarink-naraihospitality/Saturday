import { useRef } from 'react';
import './editors/editors.css';
import { useBoardStore } from '../../store/useBoardStore';
import { useMobileUI, type CellEditorTarget } from '../state/mobileStore';
import { StatusEditor } from './editors/StatusEditor';
import { DropdownEditor } from './editors/DropdownEditor';
import { DateEditor } from './editors/DateEditor';
import { TimelineEditor } from './editors/TimelineEditor';
import { PeopleEditor } from './editors/PeopleEditor';
import { FilesEditor } from './editors/FilesEditor';
import { LinkEditor, PriorityEditor, TextEditor } from './editors/TextEditor';
import type { EditorProps } from './editors/types';

/**
 * The sheet for useMobileUI().cellEditor, one kind per column type (reference
 * screenshots 21–25). Mounted once by MobileApp. The last target is kept while
 * the sheet slides away, so it closes with its content rather than blank.
 */
export const CellEditorHost = () => {
    const target = useMobileUI(state => state.cellEditor);
    const close = useMobileUI(state => state.closeCellEditor);
    const last = useRef<CellEditorTarget | null>(target);
    if (target) last.current = target;
    const shown = target || last.current;

    const board = useBoardStore(state => (shown ? state.boards.find(b => b.id === shown.boardId) : undefined));
    const item = shown ? board?.items.find(i => i.id === shown.itemId) : undefined;
    const column = shown ? board?.columns.find(c => c.id === shown.columnId) : undefined;
    if (!shown || !board || !item || !column) return null;

    const props: EditorProps = { open: !!target, onClose: close, board, item, column, value: item.values[column.id] };
    const key = `${shown.itemId}:${shown.columnId}`;

    switch (column.type) {
        case 'status':
            return <StatusEditor key={key} {...props} />;
        case 'dropdown':
            return <DropdownEditor key={key} {...props} />;
        case 'date':
        case 'due_date':
            return <DateEditor key={key} {...props} />;
        case 'timeline':
            return <TimelineEditor key={key} {...props} />;
        case 'people':
            return <PeopleEditor key={key} {...props} />;
        case 'files':
            return <FilesEditor key={key} {...props} />;
        case 'link':
            return <LinkEditor key={key} {...props} />;
        case 'priority':
            return <PriorityEditor key={key} {...props} />;
        case 'checkbox':
            // Ticked in place (activateCell); nothing to show.
            return null;
        default:
            return <TextEditor key={key} {...props} />;
    }
};
