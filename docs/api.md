# NHG WorkSpace API

The reference for developers is the page **https://work.nhgspace.com/api-docs** (`src/pages/ApiDocsPage.tsx`). It is public and holds no keys or data. It covers:

- getting access
- what a key can read
- endpoints and parameters
- values and errors
- how to keep another system in step
- examples in curl, JavaScript and Python

Admins make keys in **Admin Console › API Keys**.

## For maintainers

| What | Where |
|---|---|
| The API (a Supabase Edge Function) | `supabase/functions/api/index.ts` |
| Keys, request log, create/revoke/check functions | `supabase/migrations/20261125_public_api_keys.sql` |
| Admin page | `src/components/admin/ApiKeys.tsx` |
| Documentation page | `src/pages/ApiDocsPage.tsx`, styles `src/styles/api_docs.css`, served alone at `/api-docs` by `src/main.tsx` |
| Proxy | `vercel.json` sends `/api/v1/*` to the function |

When the API changes, change the documentation page with it.

Deploy:

```
npx supabase functions deploy api --project-ref susgfswicrxdxaioegps --no-verify-jwt --use-api
```

Verify JWT stays off because keys are not Supabase JWTs; the function checks them itself.
