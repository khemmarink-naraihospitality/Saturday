import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import type { Column } from '../../types';
import { CURRENCY_OPTIONS } from '../../utils/format';

interface NumberFormatMenuProps {
    isOpen: boolean;
    onClose: () => void;
    position: { top: number; left: number };
    column: Column;
    onSetFormat: (format: 'number' | 'percent' | 'currency', currencyCode?: string) => void;
    onSetAlign: (align: 'left' | 'center' | 'right') => void;
}

export const NumberFormatMenu = ({
    isOpen,
    onClose,
    position,
    column,
    onSetFormat,
    onSetAlign
}: NumberFormatMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const currentFormat = column.numberFormat || 'number';
    // Unset reads as Center — the new default, so an existing column with no
    // saved preference doesn't need a migration to pick it up.
    const currentAlign = column.numberAlign || 'center';

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: '1px solid hsl(var(--color-border))',
                zIndex: 9999,
                width: '220px',
                maxHeight: '400px',
                display: 'flex',
                flexDirection: 'column',
                color: 'hsl(var(--color-text-primary))',
                fontSize: '14px',
                overflow: 'hidden'
            }}
        >
            <div style={{ padding: '8px 12px', borderBottom: '1px solid hsl(var(--color-border))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'hsl(var(--color-bg-subtle))' }}>
                <span style={{ fontWeight: 500 }}>Number Format</span>
                <button onClick={onClose} className="icon-btn" style={{ padding: 4 }}><X size={14} /></button>
            </div>

            <div style={{ padding: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                <div
                    onClick={() => { onSetFormat('number'); onClose(); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', cursor: 'pointer', borderRadius: '4px' }}
                    className="hover-bg"
                >
                    <span>Number</span>
                    {currentFormat === 'number' && <Check size={14} />}
                </div>
                <div
                    onClick={() => { onSetFormat('percent'); onClose(); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', cursor: 'pointer', borderRadius: '4px' }}
                    className="hover-bg"
                >
                    <span>Percent (%)</span>
                    {currentFormat === 'percent' && <Check size={14} />}
                </div>

                <div style={{ borderTop: '1px solid hsl(var(--color-border))', margin: '6px 0' }} />
                <div style={{ padding: '4px 8px', fontSize: '11px', color: 'hsl(var(--color-text-secondary))', textTransform: 'uppercase' }}>
                    Alignment
                </div>
                <div style={{ display: 'flex', gap: '4px', padding: '2px 8px 6px' }}>
                    {([
                        { value: 'left' as const, icon: AlignLeft, label: 'Left' },
                        { value: 'center' as const, icon: AlignCenter, label: 'Center' },
                        { value: 'right' as const, icon: AlignRight, label: 'Right' }
                    ]).map(({ value, icon: Icon, label }) => (
                        <button
                            key={value}
                            onClick={() => onSetAlign(value)}
                            title={label}
                            className="hover-bg"
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '6px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                border: currentAlign === value ? '1px solid hsl(var(--color-brand-primary))' : '1px solid transparent',
                                backgroundColor: currentAlign === value ? 'hsl(var(--color-brand-primary) / 0.1)' : 'transparent',
                                color: currentAlign === value ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))'
                            }}
                        >
                            <Icon size={16} />
                        </button>
                    ))}
                </div>

                <div style={{ borderTop: '1px solid hsl(var(--color-border))', margin: '6px 0' }} />
                <div style={{ padding: '4px 8px', fontSize: '11px', color: 'hsl(var(--color-text-secondary))', textTransform: 'uppercase' }}>
                    Currency
                </div>
                {CURRENCY_OPTIONS.map(opt => (
                    <div
                        key={opt.code}
                        onClick={() => { onSetFormat('currency', opt.code); onClose(); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', cursor: 'pointer', borderRadius: '4px' }}
                        className="hover-bg"
                    >
                        <span>{opt.symbol} {opt.code} - {opt.label}</span>
                        {currentFormat === 'currency' && column.currencyCode === opt.code && <Check size={14} />}
                    </div>
                ))}
                <style>{`
                    .hover-bg:hover { background-color: hsl(var(--color-bg-surface-hover)) !important; }
                `}</style>
            </div>
        </div>,
        document.body
    );
};
