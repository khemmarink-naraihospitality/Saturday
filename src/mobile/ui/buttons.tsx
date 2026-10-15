import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconButtonVariant = 'chip' | 'ghost' | 'card' | 'accent';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Required: the button has no text of its own. */
    label: string;
    variant?: IconButtonVariant;
    size?: number;
    children: ReactNode;
}

/** A 44pt square button with an icon: header actions, toolbar buttons. */
export const IconButton = ({ label, variant = 'chip', size = 44, className = '', style, children, ...rest }: IconButtonProps) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        className={`m-icon-btn${variant === 'chip' ? '' : ` m-icon-btn--${variant}`} ${className}`.trim()}
        style={size === 44 ? style : { width: size, height: size, ...style }}
        {...rest}
    >
        {children}
    </button>
);

/** A link-coloured text button ("Edit", "See all", "Clear"). */
export const TextButton = ({ className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" className={`m-text-btn ${className}`.trim()} {...rest}>
        {children}
    </button>
);

/** The filled accent button ("Save", "Add"). */
export const PrimaryButton = ({ className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" className={`m-primary-btn ${className}`.trim()} {...rest}>
        {children}
    </button>
);
