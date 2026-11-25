# NHG WorkSpace API (v1)

Read Spaces, their tasks and the comments on them from another system. The API is read only: it never changes anything in NHG WorkSpace.

- Base URL: `https://work.nhgspace.com/api/v1`
- Format: JSON (UTF-8). Times are ISO 8601 in UTC. Dates are `YYYY-MM-DD`.
- Keys: an admin creates them in **Admin Console › API Keys**. Each key reads only the Space Folders and Spaces chosen for it. A folder includes every folder under it, and Spaces added there later.
- Never served: private (PIN) Spaces, and anything in the Trash.

## Authentication

Send the key with every request:

```
Authorization: Bearer nhg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

`X-API-Key: nhg_…` works too.

Keep the key on a server, in an environment variable or a secret store. The API sends no CORS headers, so a browser page can't call it, and a key in a web page would be exposed anyway. If a key leaks, an admin revokes it and creates a new one.

## Limits

- 120 requests a minute per key. Every response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
- Over the limit you get `429` with `Retry-After: 60`.
- Every request is logged with the key, path, status and IP address, and kept for 90 days.

## Words

| API | In the app (NHG) | Database |
|---|---|---|
| folder | Space Folder | workspace |
| space | Space | board |
| group | Task Group | group |
| task | Task | item |
| task with `parent_id` | Subtask | sub-item |
| comment | Comment | update |

## Endpoints

### `GET /api/v1`

Returns what the key can reach and the list of endpoints:

```json
{ "api": "NHG WorkSpace API", "version": 1,
  "key": { "name": "IT requests sync", "folders": 2, "spaces": 9, "expires_at": null },
  "endpoints": ["GET /api/v1", "…"] }
```

### `GET /api/v1/folders`

```json
{ "data": [ { "id": "…", "title": "Business Tech", "parent_id": null, "path": ["Business Tech"], "space_count": 6 } ] }
```

### `GET /api/v1/spaces`

`?folder_id=` limits the list to one folder.

```json
{ "data": [ {
  "id": "…", "title": "IT Ordering", "description": null,
  "folder": { "id": "…", "title": "Business Tech" }, "path": ["Business Tech"],
  "created_at": "…", "updated_at": "…",
  "url": "https://work.nhgspace.com/?boardId=…" } ] }
```

### `GET /api/v1/spaces/{space_id}`

The Space with its groups and columns. A column's `for` is `task` or `subtask`. Subtask columns belong to one group (`group_id`). Status and dropdown columns list their `options`.

```json
{ "data": { "id": "…", "title": "IT Ordering", "…": "…",
  "groups": [ { "id": "…", "title": "Ordering", "color": "#579bfc", "position": 0 } ],
  "columns": [ { "id": "…", "title": "Status", "type": "status", "for": "task", "group_id": null,
                 "options": [ { "id": "…", "label": "Done", "color": "#00C875" } ] } ] } }
```

### `GET /api/v1/spaces/{space_id}/tasks`

Returns top-level tasks in board order. Each one carries its subtasks. Results come one page at a time.

| Parameter | |
|---|---|
| `limit` | 1–200, default 50 |
| `cursor` | the `next_cursor` of the previous page |
| `updated_since` | only tasks changed since then, e.g. `2026-11-25T08:00:00Z`. A change to a subtask, or a new comment, counts as a change to the task. |
| `group_id` | one group only |
| `subtasks=false` | leave subtasks out |
| `include=comments` | add each task's comments |

```json
{ "data": [ {
    "id": "…", "title": "Laptop for new GM", "space_id": "…",
    "group": { "id": "…", "title": "Ordering" }, "parent_id": null,
    "position": 3, "hidden": false,
    "created_at": "…", "updated_at": "…",
    "url": "https://work.nhgspace.com/?boardId=…&itemId=…",
    "values": { "Status": "Working on it", "Owner": ["Jirayu Chaichana"], "Timeline": { "start": "2026-11-20", "end": "2026-11-28" }, "Budget": 42000 },
    "fields": [ { "column_id": "…", "title": "Status", "type": "status",
                  "value": { "id": "…", "label": "Working on it", "color": "#FDAB3D" }, "text": "Working on it" } ],
    "comment_count": 2,
    "subtasks": [ { "id": "…", "parent_id": "…", "…": "…" } ] } ],
  "total": 128, "next_cursor": "50" }
```

To fetch everything, keep calling with `cursor=<next_cursor>` until `next_cursor` is `null`. To stay in step with the app, store the time each pull starts and pass it as `updated_since` next time.

### `GET /api/v1/tasks/{task_id}`

One task or subtask. A task includes its `subtasks`. Add `?include=comments` for its comments.

### `GET /api/v1/tasks/{task_id}/comments`

Returns comments newest first. Each comment carries its replies, oldest first.

```json
{ "data": [ {
  "id": "…", "author": { "id": "…", "name": "Wendell Tomas", "email": "…" },
  "text": "@Wendell Tomas Do we have a chance for future business with this account?",
  "html": "<span data-id=…>@Wendell Tomas</span>&nbsp;Do we …",
  "created_at": "2026-10-16T07:42:27.058Z", "files": [], "likes": 0,
  "replies": [ { "id": "…", "text": "…", "…": "…" } ] } ] }
```

`html` is exactly what the person wrote in the app's editor. Treat it as untrusted: sanitize it before showing it anywhere, or use `text`.

## Values

There are two forms of a task's values:

- `values` maps each column title to a simple value. A second column with the same title is keyed `"Status (2)"`.
- `fields` lists every column with its `column_id`, `type`, full `value` and display `text`.

| Column type | `fields[].value` | `values[title]` |
|---|---|---|
| text, long_text | string | same |
| number | number | same |
| status | `{ id, label, color }` | label |
| dropdown | `["label", …]` | same |
| date, due_date | `"YYYY-MM-DD"` | same |
| timeline | `{ start, end }` | same |
| people | `[{ id, name, email }]` | `["name", …]` |
| checkbox | `true` / `false` | same |
| link | `{ url, label }` | same |
| files | `[{ name, url, type }]` | same |
| priority | 1–5 | same |
| formula | `null` (not served yet) | `null` |

An empty cell is `null`, or `[]` for dropdown, people and files.

## Errors

Errors come back with a status code and this body:

```json
{ "error": { "code": "not_found", "message": "No Space with this id is available to this key." } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `bad_request` | a parameter is wrong (`limit`, `cursor`, `updated_since`) |
| 401 | `unauthorized` / `key_expired` | no key, an unknown or revoked key, or an expired one |
| 404 | `not_found` | no such Space or task, or not one this key may read (the answer is the same either way) |
| 405 | `method_not_allowed` | anything but GET |
| 429 | `rate_limited` | over 120 requests a minute |
| 500 | `server_error` | our side; try again |

## Example

```bash
KEY=nhg_…   # from Admin Console › API Keys
curl -s -H "Authorization: Bearer $KEY" https://work.nhgspace.com/api/v1/spaces
curl -s -H "Authorization: Bearer $KEY" "https://work.nhgspace.com/api/v1/spaces/<space_id>/tasks?limit=100&updated_since=2026-11-24T00:00:00Z"
```

## For maintainers

- Function: `supabase/functions/api/index.ts`.
- Tables and functions: `supabase/migrations/20261125_public_api_keys.sql`.
- Admin page: `src/components/admin/ApiKeys.tsx`.
- `vercel.json` proxies `/api/v1/*` to the function.
- Deploy with `npx supabase functions deploy api --project-ref susgfswicrxdxaioegps --no-verify-jwt --use-api`. Verify JWT stays off because keys are not Supabase JWTs; the function checks the key itself.
