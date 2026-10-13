import DOMPurify from 'dompurify';

// Updates and replies are stored as the editor's raw HTML and rendered back
// with dangerouslySetInnerHTML, so anything a member put in the body — their
// own <img onerror=…>, a hand-written API call with arbitrary HTML — ran as
// script in every teammate's session. Run stored HTML through this on the way
// out (render) and on the way back into the editor (edit).
//
// What RichTextEditor produces and so must survive: text formatting, lists,
// tables, <font>/<span style> colours and sizes, links with target=_blank,
// <img> (GIFs), @mention chips (data-id — mention notifications are parsed
// from it), and checklist rows (<input type="checkbox">, contenteditable
// markers, data-checklist-new). Everything else — script, iframe, event
// handlers, javascript: URLs, forms — goes.

const ALLOWED_INPUT_TYPES = new Set(['checkbox']);

let configured = false;
const configure = () => {
    if (configured) return;
    configured = true;

    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A' && node.getAttribute('target')) {
            node.setAttribute('rel', 'noopener noreferrer');
        }
        // A checklist box is the only form control the editor makes; a text
        // box or file picker has no business inside a posted update.
        if (node.tagName === 'INPUT' && !ALLOWED_INPUT_TYPES.has((node.getAttribute('type') || '').toLowerCase())) {
            node.remove();
        }
    });
};

export const sanitizeHtml = (html: string | null | undefined): string => {
    if (!html) return '';
    configure();
    return DOMPurify.sanitize(html, {
        ADD_ATTR: ['target', 'contenteditable'],
        FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'option', 'iframe', 'object', 'embed', 'meta', 'link', 'base'],
    });
};
