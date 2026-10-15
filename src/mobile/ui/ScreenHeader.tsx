import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

interface ScreenHeaderProps {
    title: ReactNode;
    /** Shows the back chevron when given. */
    onBack?: () => void;
    /** Right-hand buttons (IconButtons), already spaced by the header. */
    actions?: ReactNode;
    /** Tapping the title (e.g. to rename). */
    onTitleClick?: () => void;
}

/**
 * The top of every pushed screen (a workspace, a board): back chevron, a bold
 * title that truncates, and square action buttons on the right.
 */
export const ScreenHeader = ({ title, onBack, actions, onTitleClick }: ScreenHeaderProps) => (
    <header className="m-header">
        {onBack && (
            <button type="button" className="m-header__back" onClick={onBack} aria-label="Back">
                <ChevronLeft size={30} strokeWidth={2} />
            </button>
        )}
        <h1
            className="m-header__title"
            onClick={onTitleClick}
            style={onTitleClick ? { cursor: 'pointer' } : undefined}
        >
            {title}
        </h1>
        {actions && <div className="m-header__actions">{actions}</div>}
    </header>
);
