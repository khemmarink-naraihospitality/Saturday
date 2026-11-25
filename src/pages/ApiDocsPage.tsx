import { useEffect, useState, type ReactNode } from 'react';
import '../styles/api_docs.css';

/*
 * The NHG WorkSpace API's documentation, at /api-docs: public, standing alone
 * (main.tsx renders it without the app), for the developers of the systems
 * that read from NHG WorkSpace. It holds no keys and no data. The API itself
 * is supabase/functions/api; keep this page in step with it.
 */

const BASE = 'https://work.nhgspace.com/api/v1';
// The Narai "N" in Galangal on transparent (NHG_LOGO in src/lib/brand.ts, not
// imported: that module brings the app's theme store with it).
const LOGO = 'https://guideline.lubd.com/wp-content/uploads/2026/02/n.png';

const SECTIONS: [string, string][] = [
    ['access', 'Getting access'],
    ['scope', 'What a key can read'],
    ['requests', 'Making requests'],
    ['words', 'Words'],
    ['endpoints', 'Endpoints'],
    ['values', 'Values'],
    ['sync', 'Keeping in step'],
    ['errors', 'Errors'],
    ['examples', 'Examples'],
];

interface Endpoint {
    id: string;
    path: string;
    title: string;
    about: ReactNode;
    params?: [string, ReactNode][];
    example: string;
}

const ENDPOINTS: Endpoint[] = [
    {
        id: 'ep-index',
        path: '/api/v1',
        title: 'Check a key',
        about: <>What the key is called, how many folders and Spaces it reaches, when it expires, and the list of endpoints. Call it first to see that a key works.</>,
        example: `{
  "api": "NHG WorkSpace API",
  "version": 1,
  "key": { "name": "n8n — IT ordering sync", "folders": 2, "spaces": 9, "expires_at": null },
  "endpoints": ["GET /api/v1", "GET /api/v1/folders", "…"]
}`,
    },
    {
        id: 'ep-folders',
        path: '/api/v1/folders',
        title: 'Folders',
        about: <>The Space Folders the key reaches, each with its path from the top and how many Spaces it holds.</>,
        example: `{
  "data": [
    { "id": "2a5ebeef-…", "title": "Business Tech", "parent_id": null,
      "path": ["Business Tech"], "space_count": 6 }
  ]
}`,
    },
    {
        id: 'ep-spaces',
        path: '/api/v1/spaces',
        title: 'Spaces',
        about: <>Every Space the key reaches.</>,
        params: [['folder_id', 'Only the Spaces directly in this folder.']],
        example: `{
  "data": [
    { "id": "8c1d…", "title": "IT Ordering", "description": null,
      "folder": { "id": "2a5e…", "title": "Business Tech" },
      "path": ["Business Tech"],
      "created_at": "2026-03-02T04:11:09Z", "updated_at": "2026-11-24T10:02:51Z",
      "url": "https://work.nhgspace.com/?boardId=8c1d…" }
  ]
}`,
    },
    {
        id: 'ep-space',
        path: '/api/v1/spaces/{space_id}',
        title: 'One Space',
        about: <>The Space with its task groups and columns. A column is <code>for</code> tasks or subtasks; subtask columns belong to one group (<code>group_id</code>). Status and dropdown columns list their <code>options</code>.</>,
        example: `{
  "data": {
    "id": "8c1d…", "title": "IT Ordering", "…": "…",
    "groups": [ { "id": "g-1…", "title": "Ordering", "color": "#579bfc", "position": 0 } ],
    "columns": [
      { "id": "c-7…", "title": "Status", "type": "status", "for": "task", "group_id": null,
        "options": [ { "id": "o-2…", "label": "Done", "color": "#00C875" } ] }
    ]
  }
}`,
    },
    {
        id: 'ep-tasks',
        path: '/api/v1/spaces/{space_id}/tasks',
        title: 'Tasks in a Space',
        about: <>Top-level tasks in the Space’s order, each with its subtasks, a page at a time. A task’s values come twice: <code>values</code> by column title, and <code>fields</code> with every column’s id, type, full value and text (see <a href="#values">Values</a>).</>,
        params: [
            ['limit', <>1–200 tasks a page; 50 if left out.</>],
            ['cursor', <>The <code>next_cursor</code> of the page before. Keep asking until it is <code>null</code>.</>],
            ['updated_since', <>Only tasks changed since then, e.g. <code>2026-11-25T08:00:00Z</code>. A changed subtask or a new comment counts as a change to its task.</>],
            ['group_id', 'Only this task group.'],
            ['subtasks=false', 'Leave subtasks out.'],
            ['include=comments', 'Add each task’s comments.'],
        ],
        example: `{
  "data": [
    {
      "id": "5f0e…", "title": "Laptop for new GM", "space_id": "8c1d…",
      "group": { "id": "g-1…", "title": "Ordering" },
      "parent_id": null, "position": 3, "hidden": false,
      "created_at": "2026-11-20T03:12:44Z", "updated_at": "2026-11-25T07:53:20Z",
      "url": "https://work.nhgspace.com/?boardId=8c1d…&itemId=5f0e…",
      "values": {
        "Status": "Working on it",
        "Owner": ["Jirayu Chaichana"],
        "Timeline": { "start": "2026-11-20", "end": "2026-11-28" },
        "Budget": 42000
      },
      "fields": [
        { "column_id": "c-7…", "title": "Status", "type": "status",
          "value": { "id": "o-1…", "label": "Working on it", "color": "#FDAB3D" },
          "text": "Working on it" }
      ],
      "comment_count": 2,
      "subtasks": [ { "id": "9a2b…", "parent_id": "5f0e…", "…": "…" } ]
    }
  ],
  "total": 128,
  "next_cursor": "50"
}`,
    },
    {
        id: 'ep-task',
        path: '/api/v1/tasks/{task_id}',
        title: 'One task',
        about: <>A task or a subtask, as in the list. A task carries its <code>subtasks</code>.</>,
        params: [['include=comments', 'Add its comments.']],
        example: `{ "data": { "id": "5f0e…", "title": "Laptop for new GM", "…": "…", "subtasks": [] } }`,
    },
    {
        id: 'ep-comments',
        path: '/api/v1/tasks/{task_id}/comments',
        title: 'Comments on a task',
        about: <>Newest first, each with its replies oldest first. <code>text</code> is the comment as plain text; <code>html</code> is exactly what was written in the app’s editor — treat it as untrusted and sanitize it before showing it anywhere.</>,
        example: `{
  "data": [
    {
      "id": "d67d…",
      "author": { "id": "85f5…", "name": "Matchima Permsuk", "email": "…@naraihospitality.com" },
      "text": "@Wendell Tomas Do we have a chance for future business with this account?",
      "html": "<span data-id=…>@Wendell Tomas</span>&nbsp;Do we have …",
      "created_at": "2026-10-16T07:42:27.058Z", "files": [], "likes": 0,
      "replies": [ { "id": "2974…", "text": "Yes, they already signed.", "…": "…" } ]
    }
  ]
}`,
    },
];

const VALUES: [string, string, string][] = [
    ['text, long_text', 'string', 'same'],
    ['number', 'number', 'same'],
    ['status', '{ id, label, color }', 'label'],
    ['dropdown', '["label", …]', 'same'],
    ['date, due_date', '"YYYY-MM-DD"', 'same'],
    ['timeline', '{ start, end }', 'same'],
    ['people', '[{ id, name, email }]', '["name", …]'],
    ['checkbox', 'true / false', 'same'],
    ['link', '{ url, label }', 'same'],
    ['files', '[{ name, url, type }]', 'same'],
    ['priority', '1–5', 'same'],
    ['formula', 'null — not served yet', 'null'],
];

const ERRORS: [string, string, string][] = [
    ['400', 'bad_request', 'A parameter is wrong: limit, cursor or updated_since.'],
    ['401', 'unauthorized', 'No key, or one that is unknown or revoked.'],
    ['401', 'key_expired', 'The key has passed its expiry date.'],
    ['404', 'not_found', 'No such Space or task — or not one this key may read. The answer is the same either way.'],
    ['405', 'method_not_allowed', 'Anything but GET.'],
    ['429', 'rate_limited', 'Over 120 requests a minute. Wait for Retry-After (60 seconds).'],
    ['500', 'server_error', 'Our side. Try again in a moment.'],
];

const EXAMPLES: { id: string; label: string; code: string }[] = [
    {
        id: 'curl',
        label: 'curl',
        code: `# Keep the key in an environment variable, never in the script.
export NHG_API_KEY=nhg_…

curl -s -H "Authorization: Bearer $NHG_API_KEY" ${BASE}

curl -s -H "Authorization: Bearer $NHG_API_KEY" \\
  "${BASE}/spaces/<space_id>/tasks?limit=200&updated_since=2026-11-24T00:00:00Z"`,
    },
    {
        id: 'js',
        label: 'JavaScript',
        code: `// Node 18 or later
const BASE = '${BASE}';
const headers = { Authorization: \`Bearer \${process.env.NHG_API_KEY}\` };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Every task in a Space (changed since a time, if given), page by page.
async function allTasks(spaceId, updatedSince) {
  const tasks = [];
  let cursor = null;
  for (;;) {
    const url = new URL(\`\${BASE}/spaces/\${spaceId}/tasks\`);
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);
    if (updatedSince) url.searchParams.set('updated_since', updatedSince);

    const res = await fetch(url, { headers });
    if (res.status === 429) { await sleep(60_000); continue; }
    if (!res.ok) throw new Error((await res.json()).error.message);

    const page = await res.json();
    tasks.push(...page.data);
    if (!page.next_cursor) return tasks;
    cursor = page.next_cursor;
  }
}`,
    },
    {
        id: 'py',
        label: 'Python',
        code: `import os, time, requests

BASE = "${BASE}"
HEADERS = {"Authorization": f"Bearer {os.environ['NHG_API_KEY']}"}

def all_tasks(space_id, updated_since=None):
    """Every task in a Space (changed since a time, if given), page by page."""
    tasks, params = [], {"limit": 200}
    if updated_since:
        params["updated_since"] = updated_since
    while True:
        r = requests.get(f"{BASE}/spaces/{space_id}/tasks", headers=HEADERS, params=params, timeout=30)
        if r.status_code == 429:
            time.sleep(60)
            continue
        r.raise_for_status()
        page = r.json()
        tasks += page["data"]
        if not page["next_cursor"]:
            return tasks
        params["cursor"] = page["next_cursor"]`,
    },
];

const Copy = ({ text, label = 'Copy' }: { text: string; label?: string }) => {
    const [done, setDone] = useState(false);
    return (
        <button
            type="button"
            className="ref-copy"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    setDone(true);
                    setTimeout(() => setDone(false), 1800);
                } catch { /* select and copy by hand */ }
            }}
        >
            {done ? 'Copied' : label}
        </button>
    );
};

const Code = ({ children, title }: { children: string; title?: string }) => (
    <div className="ref-code">
        <div className="ref-code__bar">
            <span>{title ?? 'JSON'}</span>
            <Copy text={children} />
        </div>
        <pre><code>{children}</code></pre>
    </div>
);

const Params = ({ rows }: { rows: [string, ReactNode][] }) => (
    <table className="ref-table ref-table--params">
        <thead><tr><th>Parameter</th><th>What it does</th></tr></thead>
        <tbody>
            {rows.map(([name, what]) => (
                <tr key={name}><td><code>{name}</code></td><td>{what}</td></tr>
            ))}
        </tbody>
    </table>
);

export const ApiDocsPage = () => {
    const [example, setExample] = useState(EXAMPLES[0].id);

    useEffect(() => {
        document.title = 'NHG WorkSpace API';
        // The code face, only for this page.
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap';
        document.head.appendChild(link);
        document.documentElement.classList.add('apidocs-root');
        return () => {
            link.remove();
            document.documentElement.classList.remove('apidocs-root');
        };
    }, []);

    const shown = EXAMPLES.find(e => e.id === example)!;

    return (
        <div className="apidocs">
            <header className="ref-hero">
                <div className="ref-hero__inner">
                    <div className="ref-topbar">
                        <a className="ref-brand" href="/" aria-label="NHG WorkSpace">
                            <img src={LOGO} alt="" width={44} height={44} />
                            <span className="ref-brand__name">NHG <span>WorkSpace</span></span>
                            <span className="ref-brand__tag">API</span>
                        </a>
                        <a className="ref-open" href="/">Open NHG WorkSpace →</a>
                    </div>
                    <p className="ref-eyebrow">For developers · Version 1</p>
                    <h1>The NHG WorkSpace API</h1>
                    <p className="ref-lede">
                        Read Spaces, their tasks and the comments on them from another system, as JSON, with a key from your NHG WorkSpace admin.
                        It only reads: nothing in NHG WorkSpace can be changed through it.
                    </p>
                    <div className="ref-base">
                        <span className="ref-base__label">Base URL</span>
                        <code>{BASE}</code>
                        <Copy text={BASE} />
                    </div>
                    <ul className="ref-facts">
                        <li>Read only</li>
                        <li>JSON over HTTPS</li>
                        <li>A key per system</li>
                        <li>120 requests a minute</li>
                    </ul>
                </div>
            </header>

            <div className="ref-layout">
                <nav className="ref-nav" aria-label="On this page">
                    <span className="ref-nav__title">On this page</span>
                    <ul>
                        {SECTIONS.map(([id, title]) => (
                            <li key={id}>
                                <a href={`#${id}`}>{title}</a>
                                {id === 'endpoints' && (
                                    <ul>
                                        {ENDPOINTS.map(e => <li key={e.id}><a href={`#${e.id}`}>{e.title}</a></li>)}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ul>
                </nav>

                <main className="ref-main">
                    <section id="access" className="ref-section">
                        <h2>Getting access</h2>
                        <p>Every system that reads from NHG WorkSpace has a key of its own. Only NHG WorkSpace admins can make one.</p>
                        <ol className="ref-steps">
                            <li>
                                <span className="ref-steps__n" aria-hidden="true">1</span>
                                <div>
                                    <h3>Ask an admin for a key</h3>
                                    <p>
                                        Admins make keys in <strong>Admin Console › API Keys</strong>. Tell them which system the key is for and which Space Folders or Spaces it has to read;
                                        the key will read those and nothing else. They may also give it an expiry date.
                                    </p>
                                </div>
                            </li>
                            <li>
                                <span className="ref-steps__n" aria-hidden="true">2</span>
                                <div>
                                    <h3>Keep it secret, on your server</h3>
                                    <p>
                                        A key looks like <code>nhg_</code> followed by 40 characters, and is shown only once, when it is made. Store it where your server keeps secrets
                                        (an environment variable or a secret store), never in a web page, a mobile app, a spreadsheet, a repository or a chat.
                                        Browsers can’t call the API at all: it sends no CORS headers.
                                    </p>
                                </div>
                            </li>
                            <li>
                                <span className="ref-steps__n" aria-hidden="true">3</span>
                                <div>
                                    <h3>Send it with every request</h3>
                                    <p>Put it in the <code>Authorization</code> header (or <code>X-API-Key</code>), then start with <code>GET /api/v1</code> to see what it reaches.</p>
                                    <Code title="HTTP">{`GET /api/v1 HTTP/1.1
Host: work.nhgspace.com
Authorization: Bearer nhg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Code>
                                </div>
                            </li>
                        </ol>
                        <p className="ref-note">If a key leaks, ask an admin to revoke it at once and make a new one. A revoked or expired key gets <code>401</code> from then on.</p>
                    </section>

                    <section id="scope" className="ref-section">
                        <h2>What a key can read</h2>
                        <ul className="ref-list">
                            <li>The <strong>Space Folders</strong> chosen for it, every folder under them, and Spaces added to them later.</li>
                            <li>The single <strong>Spaces</strong> chosen for it.</li>
                            <li>In those Spaces: task groups, columns, tasks with every column’s value, subtasks, and comments with their replies.</li>
                            <li><strong>Never</strong> a private Space (one locked with a PIN), and never anything in the Trash — a folder, Space, task group, task or column.</li>
                            <li><strong>Nothing to write with:</strong> every endpoint is a <code>GET</code>.</li>
                        </ul>
                    </section>

                    <section id="requests" className="ref-section">
                        <h2>Making requests</h2>
                        <ul className="ref-list">
                            <li>Answers are JSON in UTF-8. A list comes as <code>{'{ "data": […] }'}</code>, one thing as <code>{'{ "data": {…} }'}</code>.</li>
                            <li>Times are ISO 8601 in UTC (<code>2026-11-25T07:53:20Z</code>); dates are <code>YYYY-MM-DD</code>.</li>
                            <li>Tasks come a page at a time: follow <code>next_cursor</code> until it is <code>null</code>.</li>
                            <li>Each key may make <strong>120 requests a minute</strong>. Every answer has <code>X-RateLimit-Limit</code> and <code>X-RateLimit-Remaining</code>; over the limit you get <code>429</code> with <code>Retry-After: 60</code>.</li>
                            <li>Every request is logged — the key, the address asked for, the answer’s status and the IP address — and kept for 90 days.</li>
                        </ul>
                    </section>

                    <section id="words" className="ref-section">
                        <h2>Words</h2>
                        <p>The API uses the app’s words. In the database and older screens the same things have other names:</p>
                        <table className="ref-table">
                            <thead><tr><th>In the API</th><th>In NHG WorkSpace</th><th>Also called</th></tr></thead>
                            <tbody>
                                <tr><td><code>folder</code></td><td>Space Folder</td><td>workspace</td></tr>
                                <tr><td><code>space</code></td><td>Space</td><td>board</td></tr>
                                <tr><td><code>group</code></td><td>Task Group</td><td>group</td></tr>
                                <tr><td><code>task</code></td><td>Task</td><td>item</td></tr>
                                <tr><td><code>task</code> with a <code>parent_id</code></td><td>Subtask</td><td>sub-item</td></tr>
                                <tr><td><code>comment</code></td><td>Comment</td><td>update</td></tr>
                            </tbody>
                        </table>
                    </section>

                    <section id="endpoints" className="ref-section">
                        <h2>Endpoints</h2>
                        <p>All of them are <code>GET</code>, under <code>{BASE}</code>.</p>
                        {ENDPOINTS.map(e => (
                            <article key={e.id} id={e.id} className="ref-endpoint">
                                <h3>{e.title}</h3>
                                <p className="ref-route"><span className="ref-method">GET</span><code>{e.path}</code></p>
                                <p>{e.about}</p>
                                {e.params && <Params rows={e.params} />}
                                <details className="ref-example">
                                    <summary>Example answer</summary>
                                    <Code>{e.example}</Code>
                                </details>
                            </article>
                        ))}
                    </section>

                    <section id="values" className="ref-section">
                        <h2>Values</h2>
                        <p>
                            Each task has its values twice. <code>values</code> maps a column’s title to a plain value, handy in automation tools; a second column with the same title
                            is keyed <code>"Status (2)"</code>. <code>fields</code> lists every column with its <code>column_id</code>, <code>type</code>, full <code>value</code> and the
                            <code>text</code> the app shows. An empty cell is <code>null</code>, or <code>[]</code> for dropdown, people and files.
                        </p>
                        <table className="ref-table">
                            <thead><tr><th>Column type</th><th><code>fields[].value</code></th><th><code>values[title]</code></th></tr></thead>
                            <tbody>
                                {VALUES.map(([type, full, plain]) => (
                                    <tr key={type}><td>{type}</td><td><code>{full}</code></td><td>{plain === 'same' ? <span className="ref-muted">same</span> : <code>{plain}</code>}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    <section id="sync" className="ref-section">
                        <h2>Keeping another system in step</h2>
                        <ol className="ref-list ref-list--numbered">
                            <li>Note the time just <em>before</em> each pull starts.</li>
                            <li>Ask for <code>/spaces/{'{space_id}'}/tasks?updated_since=</code> the time noted before the last pull, following <code>next_cursor</code> to the end.</li>
                            <li>Save the time you noted for the next pull. New comments and changed subtasks bring their task along.</li>
                        </ol>
                        <p className="ref-note">
                            A task moved to the Trash simply stops appearing; the API doesn’t announce it. To catch those, compare the ids of a full pull (no <code>updated_since</code>) with yours now and then — once a night is plenty.
                        </p>
                    </section>

                    <section id="errors" className="ref-section">
                        <h2>Errors</h2>
                        <p>An error comes with its HTTP status and this body:</p>
                        <Code>{`{ "error": { "code": "not_found", "message": "No Space with this id is available to this key." } }`}</Code>
                        <table className="ref-table">
                            <thead><tr><th>Status</th><th><code>code</code></th><th>When</th></tr></thead>
                            <tbody>
                                {ERRORS.map(([status, code, when]) => (
                                    <tr key={code}><td><span className={`ref-status ref-status--${status[0]}`}>{status}</span></td><td><code>{code}</code></td><td>{when}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    <section id="examples" className="ref-section">
                        <h2>Examples</h2>
                        <div className="ref-tabs" role="tablist" aria-label="Language">
                            {EXAMPLES.map(e => (
                                <button key={e.id} type="button" role="tab" aria-selected={example === e.id} className={example === e.id ? 'is-on' : ''} onClick={() => setExample(e.id)}>
                                    {e.label}
                                </button>
                            ))}
                        </div>
                        <Code title={shown.label}>{shown.code}</Code>
                    </section>

                    <footer className="ref-foot">
                        <img src={LOGO} alt="" width={28} height={28} />
                        <p>NHG WorkSpace API, version 1. Questions or a key: ask your NHG WorkSpace admin.</p>
                    </footer>
                </main>
            </div>
        </div>
    );
};

export default ApiDocsPage;
