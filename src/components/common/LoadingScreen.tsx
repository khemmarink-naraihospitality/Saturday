export const LoadingScreen = ({ message }: { message?: string }) => {
    return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'hsl(var(--color-bg-base))', flexDirection: 'column', gap: '16px' }}>
            <div style={{ perspective: '400px' }}>
                <img
                    src="/loading-logo.png"
                    alt="Loading"
                    className="logo-spin"
                    style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                />
            </div>
            {message && <span style={{ color: 'hsl(var(--color-text-secondary))', fontSize: '14px' }}>{message}</span>}
            <style>{`
                @keyframes logo-spin { to { transform: rotateY(360deg); } }
                .logo-spin { animation: logo-spin 1.2s linear infinite; }
            `}</style>
        </div>
    );
};
