import type { ReactNode } from 'react';

interface SegmentedTabsProps<T extends string> {
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: ReactNode }[];
    ariaLabel?: string;
}

/** Segments in a grey pill; the chosen one is outlined in the accent ("Updates (5)"). */
export const SegmentedTabs = <T extends string>({ value, onChange, options, ariaLabel }: SegmentedTabsProps<T>) => (
    <div className="m-segmented" role="tablist" aria-label={ariaLabel}>
        {options.map(option => {
            const active = option.value === value;
            return (
                <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`m-segmented__item${active ? ' m-segmented__item--active' : ''}`}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            );
        })}
    </div>
);
