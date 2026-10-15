import type { CSSProperties, ReactNode } from 'react';

/** A white rounded card on the grey page — the building block of Home and a workspace. */
export const Card = ({ children, style, className = '', testId }: {
    children: ReactNode;
    style?: CSSProperties;
    className?: string;
    testId?: string;
}) => (
    <section className={`m-card ${className}`.trim()} style={style} data-testid={testId}>
        {children}
    </section>
);

/** A card's title row, with an optional control on the right (arrow, "See all"). */
export const CardHeader = ({ title, right, style }: { title: ReactNode; right?: ReactNode; style?: CSSProperties }) => (
    <div className="m-card__header" style={style}>
        <h2 className="m-card__title">{title}</h2>
        {right}
    </div>
);
