import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCw, Check } from 'lucide-react';

// On-screen crop window. The exported image is rendered from the exact same
// draw call at OUTPUT_SIZE, so what the user sees in the circle is precisely
// what gets uploaded — no second, separately-derived crop calculation to drift.
const VIEWPORT = 300;
const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface AvatarCropModalProps {
    file: File;
    saving?: boolean;
    onCancel: () => void;
    onConfirm: (blob: Blob) => void;
}

export const AvatarCropModal = ({ file, saving = false, onCancel, onConfirm }: AvatarCropModalProps) => {
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [error, setError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => setImg(image);
        image.onerror = () => setError("Couldn't read that image file.");
        image.src = url;
        return () => URL.revokeObjectURL(url);
    }, [file]);

    // Geometry for the current zoom/rotation. baseScale is the "cover" scale —
    // zoom 1 exactly fills the circle with no empty edges, so the user can never
    // pan a gap into frame.
    const geom = useCallback(() => {
        if (!img) return null;
        const swapped = rotation === 90 || rotation === 270;
        const boxW = swapped ? img.naturalHeight : img.naturalWidth;
        const boxH = swapped ? img.naturalWidth : img.naturalHeight;
        if (!boxW || !boxH) return null;
        const scale = (VIEWPORT / Math.min(boxW, boxH)) * zoom;
        return {
            scale,
            maxX: Math.max(0, (boxW * scale - VIEWPORT) / 2),
            maxY: Math.max(0, (boxH * scale - VIEWPORT) / 2)
        };
    }, [img, rotation, zoom]);

    // Zooming out can leave the image panned past its own edge — pull it back.
    useEffect(() => {
        const g = geom();
        if (!g) return;
        setOffset(o => {
            const x = Math.min(g.maxX, Math.max(-g.maxX, o.x));
            const y = Math.min(g.maxY, Math.max(-g.maxY, o.y));
            return x === o.x && y === o.y ? o : { x, y };
        });
    }, [geom]);

    const paint = useCallback((canvas: HTMLCanvasElement, size: number) => {
        const g = geom();
        if (!img || !g) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const k = size / VIEWPORT; // preview and export share one code path
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = '#ffffff'; // JPEG has no alpha; avoid black letterboxing
        ctx.fillRect(0, 0, size, size);
        ctx.save();
        ctx.translate(size / 2 + offset.x * k, size / 2 + offset.y * k);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(g.scale * k, g.scale * k);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2, img.naturalWidth, img.naturalHeight);
        ctx.restore();
    }, [img, geom, offset, rotation]);

    useEffect(() => {
        if (canvasRef.current) paint(canvasRef.current, VIEWPORT);
    }, [paint]);

    // Native listener so preventDefault actually works — React's onWheel is
    // registered passive and would let the page scroll behind the modal.
    useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.002)));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [img]);

    const handlePointerDown = (e: React.PointerEvent) => {
        dragRef.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragRef.current) return;
        const g = geom();
        if (!g) return;
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;
        dragRef.current = { x: e.clientX, y: e.clientY };
        setOffset(o => ({
            x: Math.min(g.maxX, Math.max(-g.maxX, o.x + dx)),
            y: Math.min(g.maxY, Math.max(-g.maxY, o.y + dy))
        }));
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        dragRef.current = null;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };

    const handleRotate = () => {
        setRotation(r => (r + 90) % 360);
        setOffset({ x: 0, y: 0 }); // old offsets mean nothing in the new orientation
    };

    const handleConfirm = () => {
        const out = document.createElement('canvas');
        out.width = OUTPUT_SIZE;
        out.height = OUTPUT_SIZE;
        paint(out, OUTPUT_SIZE);
        out.toBlob(
            blob => blob ? onConfirm(blob) : setError('Could not process the image. Please try another file.'),
            'image/jpeg',
            0.92
        );
    };

    const iconBtnStyle: React.CSSProperties = {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '32px', height: '32px', flexShrink: 0,
        borderRadius: '6px', border: '1px solid hsl(var(--color-border))',
        backgroundColor: 'hsl(var(--color-bg-surface))', cursor: 'pointer',
        color: 'hsl(var(--color-text-secondary))'
    };

    return createPortal(
        <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }}>
            <div style={{
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '10px',
                width: '380px',
                maxWidth: '94vw',
                boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                border: '1px solid hsl(var(--color-border))',
                overflow: 'hidden'
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 18px', borderBottom: '1px solid hsl(var(--color-border))'
                }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>
                        Adjust your photo
                    </h3>
                    <button onClick={onCancel} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', display: 'flex' }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: '18px' }}>
                    {error ? (
                        <div style={{ padding: '28px 8px', textAlign: 'center', fontSize: '13px', color: 'hsl(var(--color-status-red-bg))' }}>
                            {error}
                        </div>
                    ) : !img ? (
                        <div style={{ height: `${VIEWPORT}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: 'hsl(var(--color-text-tertiary))' }}>
                            Loading image...
                        </div>
                    ) : (
                        <>
                            <div
                                ref={stageRef}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerCancel={handlePointerUp}
                                style={{
                                    position: 'relative',
                                    width: `${VIEWPORT}px`, height: `${VIEWPORT}px`,
                                    margin: '0 auto',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    cursor: 'grab',
                                    touchAction: 'none',
                                    backgroundColor: '#0f172a'
                                }}
                            >
                                <canvas
                                    ref={canvasRef}
                                    width={VIEWPORT}
                                    height={VIEWPORT}
                                    style={{ display: 'block', width: '100%', height: '100%' }}
                                />
                                {/* Dim everything outside the circle, Google-style */}
                                <div style={{
                                    position: 'absolute', top: 0, left: 0,
                                    width: `${VIEWPORT}px`, height: `${VIEWPORT}px`,
                                    borderRadius: '50%',
                                    boxShadow: '0 0 0 9999px rgba(15,23,42,0.55)',
                                    border: '2px solid rgba(255,255,255,0.9)',
                                    boxSizing: 'border-box',
                                    pointerEvents: 'none'
                                }} />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' }}>
                                <button
                                    onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - 0.25))}
                                    title="Zoom out"
                                    style={iconBtnStyle}
                                >
                                    <ZoomOut size={15} />
                                </button>
                                <input
                                    type="range"
                                    min={MIN_ZOOM}
                                    max={MAX_ZOOM}
                                    step={0.01}
                                    value={zoom}
                                    onChange={e => setZoom(Number(e.target.value))}
                                    style={{ flex: 1, accentColor: 'hsl(var(--color-brand-primary))', cursor: 'pointer' }}
                                />
                                <button
                                    onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + 0.25))}
                                    title="Zoom in"
                                    style={iconBtnStyle}
                                >
                                    <ZoomIn size={15} />
                                </button>
                                <button onClick={handleRotate} title="Rotate 90°" style={iconBtnStyle}>
                                    <RotateCw size={15} />
                                </button>
                            </div>

                            <p style={{ margin: '10px 0 0', fontSize: '11px', color: 'hsl(var(--color-text-tertiary))', textAlign: 'center' }}>
                                Drag the photo to reposition · scroll to zoom
                            </p>
                        </>
                    )}
                </div>

                <div style={{
                    display: 'flex', justifyContent: 'flex-end', gap: '10px',
                    padding: '14px 18px', borderTop: '1px solid hsl(var(--color-border))'
                }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 16px', borderRadius: '4px',
                            border: '1px solid hsl(var(--color-border))', background: 'transparent',
                            cursor: 'pointer', fontSize: '13px', color: 'hsl(var(--color-text-primary))'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!img || !!error || saving}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 16px', borderRadius: '4px', border: 'none',
                            backgroundColor: 'hsl(var(--color-brand-primary))', color: 'white',
                            fontSize: '13px', fontWeight: 600,
                            cursor: (!img || !!error || saving) ? 'not-allowed' : 'pointer',
                            opacity: (!img || !!error || saving) ? 0.7 : 1
                        }}
                    >
                        <Check size={14} />
                        {saving ? 'Uploading...' : 'Set as profile photo'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
