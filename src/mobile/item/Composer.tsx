import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, Bold, Italic, Link2, List, ListOrdered, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { useGooglePicker } from '../../hooks/useGooglePicker';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import { fileLinkFromUrl } from '../../lib/fileLinks';
import { useCloudDrives } from '../../hooks/useCloudDrives';
import { hasHtmlContent, previewText } from '../../lib/updates';
import { autolinkBeforeCaret, findUrls, linkifyNode } from '../../lib/linkify';
import type { Comment, FileLink } from '../../types';
import { Avatar, BottomSheet, PrimaryButton, TextButton, mobileToast, useBoardPeople } from '../ui';
import { DRIVE_ICON, FileIcon } from '../cells/CellView';

export type ComposerMode =
    | { kind: 'new' }
    | { kind: 'reply'; parent: Comment }
    | { kind: 'edit'; update: Comment };

// Drafts outlive the sheet, as on desktop: a new update's text lives in the
// store (the same draft the desktop composer shows); its attachments and every
// reply draft live here for the session.
const newUpdateFiles = new Map<string, FileLink[]>();
const replyDrafts = new Map<string, { html: string; files: FileLink[] }>();

/** A pasted or typed link as an attachment — the desktop composer's rule. */
const linkAttachment = (raw: string): FileLink | null => fileLinkFromUrl(raw, '', uuidv4);

interface MentionUser {
    id: string;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
}

const displayName = (user: MentionUser) => user.full_name || user.email?.split('@')[0] || 'Unknown';

/**
 * The same chip RichTextEditor inserts. addUpdate() finds who was mentioned by
 * the data-id attribute, and that is what sends their notification.
 */
const mentionChip = (name: string, userId: string) => {
    const span = document.createElement('span');
    span.textContent = `@${name}`;
    span.setAttribute('data-id', userId);
    span.style.color = '#1d4ed8';
    span.style.backgroundColor = '#dbeafe';
    span.style.padding = '2px 6px';
    span.style.borderRadius = '12px';
    span.style.fontWeight = '500';
    span.style.display = 'inline-block';
    span.contentEditable = 'false';
    return span;
};

/** The "@query" being typed just before the caret, if any (the desktop editor's rule). */
const mentionAtCaret = (): { query: string; range: Range } | null => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const text = range.startContainer.textContent || '';
    const caret = range.startOffset;
    const at = text.lastIndexOf('@', caret - 1);
    if (at === -1) return null;
    const before = at > 0 ? text[at - 1] : ' ';
    if (before !== ' ' && before !== '\n' && before !== ' ') return null;
    return { query: text.substring(at + 1, caret), range: range.cloneRange() };
};

/** Toolbar buttons must not take focus from the text, or the phone keyboard drops. */
const keepFocus = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();

/**
 * Writing an update, a reply, or editing one: a full-screen sheet with the
 * text, a small formatting bar, @mentions and attachments (a link or a Google
 * Drive file). Posting goes through the same store actions as the desktop
 * panel; an update that fails to save comes back as the draft, with a message.
 */
export const Composer = ({ itemId, mode, onClose, onPosted }: {
    itemId: string;
    mode: ComposerMode | null;
    onClose: () => void;
    /** After a successful post (so the screen can show a new reply). */
    onPosted?: (mode: ComposerMode) => void;
}) => {
    const addUpdate = useBoardStore(state => state.addUpdate);
    const editUpdate = useBoardStore(state => state.editUpdate);
    const setDraft = useBoardStore(state => state.setDraft);
    const searchUsers = useBoardStore(state => state.searchUsers);
    const currentUser = useUserStore(state => state.currentUser);
    const people = useBoardPeople();
    const { openPicker } = useGooglePicker();
    const drives = useCloudDrives();

    // Keep the last mode while the sheet animates away.
    const lastMode = useRef<ComposerMode | null>(mode);
    if (mode) lastMode.current = mode;
    const shown = mode || lastMode.current;

    // What this opening starts from.
    const initial = useMemo(() => {
        if (!mode) return { html: '', files: [] as FileLink[] };
        if (mode.kind === 'edit') return { html: mode.update.content || '', files: mode.update.files || [] };
        if (mode.kind === 'reply') return replyDrafts.get(mode.parent.id) || { html: '', files: [] };
        return { html: useBoardStore.getState().drafts[itemId] || '', files: newUpdateFiles.get(itemId) || [] };
    }, [mode, itemId]);

    const editorRef = useRef<HTMLDivElement | null>(null);
    const [files, setFiles] = useState<FileLink[]>(initial.files);
    const [hasText, setHasText] = useState(hasHtmlContent(initial.html));
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkText, setLinkText] = useState('');
    const [mention, setMention] = useState<{ query: string; range: Range } | null>(null);
    const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
    const [formats, setFormats] = useState({ bold: false, italic: false, ul: false, ol: false });

    useEffect(() => {
        if (!mode) return;
        setFiles(initial.files);
        setHasText(hasHtmlContent(initial.html));
        setLinkOpen(false);
        setLinkText('');
        setMention(null);
    }, [mode, initial]);

    const currentHtml = () => editorRef.current?.innerHTML || '';

    // Closed without posting: keep what was written for next time (an edit is simply abandoned).
    const cancel = useCallback(() => {
        const m = lastMode.current;
        const html = editorRef.current ? editorRef.current.innerHTML : initial.html;
        const keep = hasHtmlContent(html) ? html : '';
        if (m?.kind === 'new') {
            setDraft(itemId, keep);
            if (files.length) newUpdateFiles.set(itemId, files);
            else newUpdateFiles.delete(itemId);
        } else if (m?.kind === 'reply') {
            if (keep || files.length) replyDrafts.set(m.parent.id, { html: keep, files });
            else replyDrafts.delete(m.parent.id);
        }
        onClose();
    }, [files, initial.html, itemId, onClose, setDraft]);

    const canPost = hasText || files.length > 0;

    const post = async () => {
        const m = mode;
        if (!m || !canPost) return;
        const html = currentHtml();
        const sentFiles = files;
        const author = { name: currentUser.name, id: currentUser.id, userId: currentUser.id };

        // Off the screen straight away; the store shows the post optimistically.
        if (m.kind === 'new') {
            setDraft(itemId, '');
            newUpdateFiles.delete(itemId);
        } else if (m.kind === 'reply') {
            replyDrafts.delete(m.parent.id);
        }
        onClose();

        if (m.kind === 'edit') {
            await editUpdate(itemId, m.update.id, html, sentFiles);
            return;
        }
        const saved = await addUpdate(itemId, html, author, sentFiles, m.kind === 'reply' ? m.parent.id : undefined);
        if (!saved) {
            // Never lose what someone wrote: it goes back in the box.
            if (m.kind === 'new') {
                setDraft(itemId, html);
                if (sentFiles.length) newUpdateFiles.set(itemId, sentFiles);
            } else {
                replyDrafts.set(m.parent.id, { html, files: sentFiles });
            }
            mobileToast(m.kind === 'reply'
                ? 'Your reply was not saved. It is back in the box — please try again.'
                : 'Your update was not saved. It is back in the box — please try again.', 'error');
            return;
        }
        onPosted?.(m);
    };

    // ── Mentions ────────────────────────────────────────────────────────────

    const boardSuggestions = useMemo<MentionUser[]>(
        () => [...people.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(p => ({ id: p.id, full_name: p.name, email: p.email, avatar_url: p.avatarUrl })),
        [people]
    );

    useEffect(() => {
        if (!mention) {
            setSuggestions([]);
            return;
        }
        // Nothing typed yet: the board's own people first.
        if (!mention.query) {
            setSuggestions(boardSuggestions.slice(0, 8));
            return;
        }
        let stale = false;
        const timer = window.setTimeout(async () => {
            const results = await searchUsers(mention.query);
            if (!stale) setSuggestions(results || []);
        }, 200);
        return () => {
            stale = true;
            window.clearTimeout(timer);
        };
    }, [mention, boardSuggestions, searchUsers]);

    const pickMention = (user: MentionUser) => {
        const target = mention;
        const el = editorRef.current;
        if (!target || !el) return;
        const range = target.range;
        const node = range.startContainer;
        const text = node.textContent || '';
        const caret = range.startOffset;
        const at = text.lastIndexOf('@', caret - 1);
        if (at === -1) return;
        range.setStart(node, at);
        range.setEnd(node, caret);
        range.deleteContents();
        const chip = mentionChip(displayName(user), user.id);
        range.insertNode(chip);
        const space = document.createTextNode(' ');
        range.setStartAfter(chip);
        range.insertNode(space);
        range.setStartAfter(space);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        el.focus({ preventScroll: true });
        setMention(null);
        setHasText(true);
    };

    // ── Editing ─────────────────────────────────────────────────────────────

    const refreshFormats = () => {
        try {
            setFormats({
                bold: document.queryCommandState('bold'),
                italic: document.queryCommandState('italic'),
                ul: document.queryCommandState('insertUnorderedList'),
                ol: document.queryCommandState('insertOrderedList'),
            });
        } catch { /* not supported: leave the buttons plain */ }
    };

    const onInput = () => {
        setHasText(hasHtmlContent(currentHtml()));
        setMention(mentionAtCaret());
        refreshFormats();
    };

    const exec = (command: string, value?: string) => {
        editorRef.current?.focus({ preventScroll: true });
        document.execCommand(command, false, value);
        onInput();
    };

    // "@" from the toolbar: typed at the caret, with a space first when it would
    // otherwise run on from a word (a mention has to start one).
    const insertAt = () => {
        const el = editorRef.current;
        el?.focus({ preventScroll: true });
        let needsSpace = false;
        const selection = window.getSelection();
        if (selection && selection.rangeCount) {
            const range = selection.getRangeAt(0);
            if (range.startContainer.nodeType === Node.TEXT_NODE) {
                const before = (range.startContainer.textContent || '')[range.startOffset - 1];
                needsSpace = !!before && before !== ' ' && before !== '\u00A0' && before !== '\n';
            }
        }
        document.execCommand('insertText', false, needsSpace ? ' @' : '@');
        onInput();
    };

    const addLink = () => {
        const file = linkAttachment(linkText);
        if (!file) return;
        setFiles(prev => [...prev, file]);
        setLinkText('');
        setLinkOpen(false);
        editorRef.current?.focus({ preventScroll: true });
    };

    const title = shown?.kind === 'reply' ? 'Reply' : shown?.kind === 'edit' ? 'Edit update' : 'New update';
    const action = shown?.kind === 'reply' ? 'Reply' : shown?.kind === 'edit' ? 'Save' : 'Post';

    return (
        <BottomSheet
            open={!!mode}
            onClose={cancel}
            size="full"
            title={title}
            headerLeft={<TextButton onClick={cancel}>Cancel</TextButton>}
            headerRight={(
                <PrimaryButton onClick={() => void post()} disabled={!canPost} style={{ minHeight: 38, padding: '0 18px', fontSize: 15.5 }}>
                    {action}
                </PrimaryButton>
            )}
            className="m-composer-sheet"
            testId="m-composer"
            bodyStyle={{ display: 'flex', flexDirection: 'column' }}
        >
            {shown?.kind === 'reply' && (
                <div className="m-composer__context">
                    <span className="m-composer__context-label">Replying to {shown.parent.author}</span>
                    <span className="m-composer__context-text">{previewText(shown.parent.content).slice(0, 160) || '…'}</span>
                </div>
            )}

            <div className="m-composer__tools" role="toolbar" aria-label="Formatting">
                <ToolButton label="Bold" on={formats.bold} onTap={() => exec('bold')}><Bold size={19} strokeWidth={2.4} /></ToolButton>
                <ToolButton label="Italic" on={formats.italic} onTap={() => exec('italic')}><Italic size={19} strokeWidth={2.2} /></ToolButton>
                <ToolButton label="Bulleted list" on={formats.ul} onTap={() => exec('insertUnorderedList')}><List size={20} strokeWidth={2} /></ToolButton>
                <ToolButton label="Numbered list" on={formats.ol} onTap={() => exec('insertOrderedList')}><ListOrdered size={20} strokeWidth={2} /></ToolButton>
                <span className="m-composer__tools-gap" />
                <ToolButton label="Mention someone" onTap={insertAt}><AtSign size={19} strokeWidth={2.2} /></ToolButton>
                <ToolButton label="Attach a link" on={linkOpen} onTap={() => setLinkOpen(v => !v)}><Link2 size={19} strokeWidth={2.2} /></ToolButton>
                {drives.google && (
                <ToolButton
                    label="Attach from Google Drive"
                    onTap={() => openPicker(result => setFiles(prev => [...prev, {
                        id: uuidv4(), name: result.name, url: result.url, type: 'google-drive', iconUrl: result.iconUrl, mimeType: result.mimeType,
                    }]))}
                >
                    <img src={DRIVE_ICON} alt="" width={19} height={19} />
                </ToolButton>
                )}
            </div>

            {linkOpen && (
                <div className="m-composer__link">
                    <input
                        autoFocus
                        type="url"
                        inputMode="url"
                        enterKeyHint="done"
                        placeholder="Paste a link to attach"
                        value={linkText}
                        onChange={(e) => setLinkText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                        aria-label="Link to attach"
                    />
                    <button type="button" className="m-composer__link-add" onClick={addLink} disabled={!linkText.trim()}>Attach</button>
                </div>
            )}

            {mention && suggestions.length > 0 && (
                <div className="m-composer__mentions" role="listbox" aria-label="People to mention">
                    {suggestions.map(user => (
                        <button
                            key={user.id}
                            type="button"
                            role="option"
                            aria-selected={false}
                            className="m-composer__mention"
                            onPointerDown={keepFocus}
                            onMouseDown={keepFocus}
                            onClick={() => pickMention(user)}
                        >
                            <Avatar name={displayName(user)} src={user.avatar_url} size={32} />
                            <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                                <span className="m-truncate" style={{ display: 'block', fontSize: 16 }}>{displayName(user)}</span>
                                {user.email && <span className="m-truncate" style={{ display: 'block', fontSize: 13, color: 'hsl(var(--m-text-2))' }}>{user.email}</span>}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {mode && (
                <Editor
                    key={mode.kind + (mode.kind === 'reply' ? mode.parent.id : mode.kind === 'edit' ? mode.update.id : '')}
                    editorRef={editorRef}
                    initialHtml={initial.html}
                    placeholder={mode.kind === 'reply' ? 'Write a reply and mention others with @' : 'Write an update and mention others with @'}
                    onInput={onInput}
                    onSelection={refreshFormats}
                />
            )}

            {files.length > 0 && (
                <div className="m-composer__files">
                    {files.map(file => (
                        <span key={file.id} className="m-composer__file">
                            <FileIcon file={file} size={16} />
                            <span className="m-truncate">{file.name}</span>
                            <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(prev => prev.filter(f => f.id !== file.id))}>
                                <X size={15} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </BottomSheet>
    );
};

const ToolButton = ({ label, on = false, onTap, children }: { label: string; on?: boolean; onTap: () => void; children: React.ReactNode }) => (
    <button
        type="button"
        className={`m-composer__tool${on ? ' m-composer__tool--on' : ''}`}
        aria-label={label}
        aria-pressed={on}
        onPointerDown={keepFocus}
        onMouseDown={keepFocus}
        onClick={onTap}
    >
        {children}
    </button>
);

/** The writing area: a contentEditable that starts from the draft and takes focus (bringing up the keyboard). */
const Editor = ({ editorRef, initialHtml, placeholder, onInput, onSelection }: {
    editorRef: React.MutableRefObject<HTMLDivElement | null>;
    initialHtml: string;
    placeholder: string;
    onInput: () => void;
    onSelection: () => void;
}) => {
    const [empty, setEmpty] = useState(!hasHtmlContent(initialHtml));

    useEffect(() => {
        const el = editorRef.current;
        if (!el) return;
        // Stored HTML is whatever a member typed: scrub it before it becomes live DOM.
        el.innerHTML = initialHtml ? sanitizeHtml(initialHtml) : '';
        // Focused while the tap that opened the sheet is still being handled,
        // which is what lets a phone show its keyboard; the caret goes last.
        el.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        const onSelectionChange = () => {
            if (document.activeElement === el) onSelection();
        };
        document.addEventListener('selectionchange', onSelectionChange);
        return () => document.removeEventListener('selectionchange', onSelectionChange);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            ref={editorRef}
            className={`m-composer__editor narai-update-content m-rich${empty ? ' m-composer__editor--empty' : ''}`}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={placeholder}
            data-placeholder={placeholder}
            onInput={(e) => {
                // A web address followed by a space becomes a link as you type.
                const input = e.nativeEvent as InputEvent;
                if (input.inputType === 'insertText' && input.data && /\s/.test(input.data) && editorRef.current) {
                    autolinkBeforeCaret(editorRef.current);
                }
                setEmpty(!hasHtmlContent(editorRef.current?.innerHTML || ''));
                onInput();
            }}
            onPaste={(e) => {
                // Pasted pages bring their own markup; keep the words — and a
                // pasted web address becomes a link straight away.
                e.preventDefault();
                const text = e.clipboardData.getData('text/plain');
                document.execCommand('insertText', false, text);
                if (findUrls(text).length && editorRef.current) linkifyNode(editorRef.current, true);
            }}
        />
    );
};
