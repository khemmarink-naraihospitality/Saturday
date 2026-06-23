import { useRef } from 'react';

interface PinDigitInputProps {
    value: string;
    onChange: (value: string) => void;
    length?: number;
    autoFocus?: boolean;
    disabled?: boolean;
    error?: boolean;
    onComplete?: (value: string) => void;
}

export const PinDigitInput = ({ value, onChange, length = 6, autoFocus, disabled, error, onComplete }: PinDigitInputProps) => {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const setDigit = (index: number, digit: string) => {
        const next = value.split('');
        next[index] = digit;
        const joined = next.join('').slice(0, length);
        onChange(joined);
        if (digit && index < length - 1) {
            inputRefs.current[index + 1]?.focus();
        }
        if (joined.length === length && joined.split('').every(c => /\d/.test(c))) {
            onComplete?.(joined);
        }
    };

    const handleChange = (index: number, raw: string) => {
        const digits = raw.replace(/\D/g, '');
        if (!digits) {
            setDigit(index, '');
            return;
        }
        if (digits.length > 1) {
            // Pasted a full code into one box
            const joined = (value.slice(0, index) + digits).slice(0, length);
            onChange(joined);
            const focusIndex = Math.min(joined.length, length - 1);
            inputRefs.current[focusIndex]?.focus();
            if (joined.length === length) onComplete?.(joined);
            return;
        }
        setDigit(index, digits);
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !value[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    return (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            {Array.from({ length }).map((_, i) => (
                <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    autoFocus={autoFocus && i === 0}
                    disabled={disabled}
                    value={value[i] || ''}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    style={{
                        width: '38px',
                        height: '44px',
                        textAlign: 'center',
                        fontSize: '18px',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: error ? '1px solid #e11d48' : '1px solid hsl(var(--color-border))',
                        backgroundColor: disabled ? 'hsl(var(--color-bg-hover))' : 'hsl(var(--color-bg-surface))',
                        color: 'hsl(var(--color-text-primary))',
                        outline: 'none'
                    }}
                />
            ))}
        </div>
    );
};
