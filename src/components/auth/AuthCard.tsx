import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { useThemeStore } from '../../store/useThemeStore';
import { NHG_LOGO } from '../../lib/brand';
import './auth.css';

const VIDEO_SOURCES = [
    { src: 'https://naraihospitalitygroup.com/wp-content/uploads/2024/10/narai-video-banner-compressed.webm', type: 'video/webm' },
    { src: 'https://naraihospitalitygroup.com/wp-content/uploads/2024/11/Narai_Header-2.mp4', type: 'video/mp4' },
];

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The frosted-glass card the sign-in screens sit in: the company's banner
 * footage full screen behind it (no tint over it — the card alone carries the
 * contrast), the Narai "N" tile, a title whose first word is bold, a subtitle,
 * then whatever the screen puts inside. Its colours are its own (Narai Green,
 * Galangal, the #FFFAF0 sheet): nobody is signed in yet, so the palette left
 * in this browser by the last person is set aside while it is shown.
 * Styles: auth.css.
 */
export const AuthCard = ({ title, subtitle, children, logoAlt = 'NHG' }: {
    title: string;
    subtitle?: ReactNode;
    children: ReactNode;
    logoAlt?: string;
}) => {
    useLayoutEffect(() => {
        const root = document.documentElement;
        const had = root.getAttribute('data-palette');
        root.removeAttribute('data-palette');
        return () => {
            const palette = useThemeStore.getState().palette;
            if (palette === 'saturday') root.removeAttribute('data-palette');
            else root.setAttribute('data-palette', had || palette);
        };
    }, []);

    // Reduced motion: no footage at all, just the Galangal ground.
    const [stillOnly, setStillOnly] = useState(prefersReducedMotion);
    useEffect(() => {
        const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!query) return;
        const update = () => setStillOnly(query.matches);
        query.addEventListener?.('change', update);
        return () => query.removeEventListener?.('change', update);
    }, []);

    const [first, ...rest] = title.trim().split(/\s+/);

    return (
        <div className="auth-page">
            {!stillOnly && (
                <video className="auth-page__video" autoPlay loop muted playsInline aria-hidden="true" tabIndex={-1}>
                    {VIDEO_SOURCES.map(s => <source key={s.src} src={s.src} type={s.type} />)}
                </video>
            )}

            <main className="auth-card" aria-labelledby="auth-card-title">
                <header className="auth-card__head">
                    <div className="auth-card__logo">
                        <img src={NHG_LOGO} alt={logoAlt} />
                    </div>
                    <h1 id="auth-card-title" className="auth-card__title">
                        <strong>{first}</strong>{rest.length ? ` ${rest.join(' ')}` : ''}
                    </h1>
                    {subtitle && <p className="auth-card__subtitle">{subtitle}</p>}
                </header>
                <div className="auth-card__body">{children}</div>
            </main>
        </div>
    );
};

/** A labelled text field in the card's style; the label is tied to the input. */
export const AuthField = ({ id, label, ...input }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="auth-field">
        <label className="auth-field__label" htmlFor={id}>{label}</label>
        <input id={id} className="auth-input" {...input} />
    </div>
);
