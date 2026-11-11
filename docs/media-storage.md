# Media storage — report photos

Where a citizen's photograph lives, and why it lives there rather than in
Postgres. Read this before touching photo upload, `app.prijava_foto`, or
anything that renders `javni_url`.

## The exception, stated plainly

Everywhere else in this repository, Supabase is **a database and nothing else**
(`docs/backend-architecture.md`). Photos are the single exception: they use
Supabase **Storage**, over the S3 protocol.

The exception is deliberately narrow, and the three properties that make it
narrow are the ones to preserve:

1. **Credentials are server-side only.** The S3 access key lives in
   `backend/.env`. No browser ever holds a storage key, and the frontend has no
   Supabase client.
2. **Bytes travel through the API.** The browser uploads to
   `POST /reports/photos`, not to Supabase. So the generated contract is still
   the only thing the frontend sees — there is no second, ungenerated contract.
3. **Postgres stores a key and a URL, never an image.** `app.prijava_foto` holds
   metadata. The object store holds bytes.

A presigned-URL scheme would break property 2 and was rejected for that reason.

## The bucket

| | |
|---|---|
| Bucket id | `neOtpad Bucket` — **with a literal space and a capital B** |
| Visibility | **Public.** Anyone with the URL can fetch the object; there is no auth on read |
| S3 endpoint | `https://qgwrsvhelwooxtmlzzfa.storage.supabase.co/storage/v1/s3` |
| Public prefix | `https://qgwrsvhelwooxtmlzzfa.supabase.co/storage/v1/object/public` |
| Region | `eu-west-1` (matches the project's database pooler host) |

**The space in the bucket id is a hazard, not a quirk.** It is not a valid S3
bucket name under AWS rules, and it must be percent-encoded (`neOtpad%20Bucket`)
in every URL. Two consequences the code already handles, and which any
replacement must keep handling:

- `S3StorageService` sets `forcePathStyle: true`. Virtual-host addressing cannot
  carry a space at all.
- `S3StorageService.url()` encodes the bucket segment and leaves the key
  unencoded — the key's slashes are path separators and must survive.

Moving to a bucket with a conventional name (`prijave-foto`) is a one-line change
to `STORAGE_BUCKET` and removes this whole class of problem. Nothing in the code
assumes the current name.

Verify both after filling in the keys, and again after ever changing
`STORAGE_BUCKET`:

```bash
cd backend && npm run storage:check   # upload, fetch over the public URL, delete
```

## Object keys

```
prijave/{yyyy}/{mm}/{uuid}.{ext}
```

Server-generated end to end. **No part of a key ever comes from the upload** — a
client-supplied filename is how a key escapes its prefix. The date segments mean
a day's uploads can be found in the bucket by prefix, without a query.

Objects are immutable: a replaced photo gets a new uuid, never a rewritten key.
That is why they are served with `Cache-Control: public, max-age=31536000,
immutable`.

## Accepted content

Only JPEG, PNG, WebP and HEIC, **decided by sniffing the first bytes**
(`backend/src/reports/photo-content.ts`). The request's `Content-Type` is
attacker-controlled and is never consulted.

HEIC is accepted because iPhones shoot it by default; refusing it would refuse a
large share of the photos this system exists to collect. An ISO-BMFF file whose
brand is video (`mp42`, `qt`) is refused — the `ftyp` box alone does not mean
still image.

**SVG is refused and must stay refused.** The bucket is public and serves what it
is given, so an accepted SVG is stored XSS on the project's own domain. A
renamed PDF, GIF, ZIP or executable is refused for the same reason.

Size ceiling: `STORAGE_MAX_BYTES`, default **8 MiB**. Enforced twice — by multer
before the body is buffered, and again in the service, because the two limits
drift apart the moment somebody edits one of them.

## Staged uploads

A photo is uploaded **before the report exists** and is claimed by the submission
that follows:

```
POST /reports/photos   →  { foto_id, javni_url, mime_tip, velicina_bajt, istice_at }
POST /reports          →  { tip, …, foto_ids: [foto_id] }
```

This shape is forced by the anonymous path: a reporter never learns the report
`id`, only `kratki_kod` — and **`kratki_kod` is a receipt, not a credential**
(`docs/reports-mvp.md`). Letting it authorise a write would turn a code printed
for telephone follow-up into an access token.

A staged row has `prijava_id is null` and `istice_at` set (**24 hours**). The
claim is a single guarded `UPDATE`:

```sql
update app.prijava_foto set prijava_id = $1, istice_at = null
where id = any($2) and prijava_id is null and istice_at > now()
```

Both conditions carry a rule. `prijava_id is null` makes a photo **single-use**,
so a leaked `foto_id` cannot be replayed onto a second report. `istice_at > now()`
refuses an expired upload even before the cleanup sweep has removed it.

If fewer rows come back than were asked for, **the whole submission is rolled
back**. A report that silently drops the photograph a citizen sent is worse than
one that is refused, because the citizen has no way to tell it happened.

## Ordering, and what leaks when it goes wrong

Neither the object store nor the database can join the other's transaction, so
the order is chosen to make failures invisible rather than broken:

| Operation | Order | Worst case |
|---|---|---|
| Upload | object first, then row | Object with no row — invisible; the sweep collects it |
| Staff removal | commit row deletion, then delete object | Orphaned object; the sweep collects it |

The reverse order in either case produces a live row pointing at an object that
is not there — a broken image in the dispatcher's queue.

Orphans are collected by `npm run cleanup:photos` (unclaimed rows past
`istice_at`, and their objects). It is safe to run repeatedly.

## Privacy

The bucket is public, so **every stored photo is world-readable to anyone who has
or guesses the URL**, forever. Photos of illegal dumps routinely contain faces,
number plates, house numbers and yards.

The mitigations that exist:

- keys are UUIDs, so URLs are not enumerable;
- `POST /reports/:id/photos/:fotoId/remove` lets a dispatcher delete a photo that
  should not be public, with a reason recorded in the report history.

The mitigation that does **not** exist: nothing stops redistribution of a URL
that has already been shared. If this system moves past a demo, the bucket should
become private and `javni_url` should give way to short-lived signed URLs minted
at read time from `kljuc`. That is why `kljuc` is stored alongside the URL rather
than being treated as derivable — it is the handle that survives the switch.

## SMS and Viber

A photo is **optional on every channel**. A report with no photograph is a
complete report, and nothing in the submission flow assumes a camera — which is
the point, since the settlements where dumps appear are the ones least likely to
have smartphones.

For an inbound MMS or Viber image, the gateway webhook fetches the media and
calls the same `StoragePort`, producing an identical `app.prijava_foto` row. No
second storage path.

## Schema

See `app.prijava_foto` in
[`backend-architecture.md`](backend-architecture.md#prijava_foto). The columns
that carry a rule:

| Column | Rule |
|---|---|
| `prijava_id` | Nullable **only** because of staging. Null means unclaimed |
| `kljuc` | Canonical handle. Unique. Survives a bucket rename; `javni_url` does not |
| `javni_url` | Built once at upload and served as-is. Never rebuilt from current config, or renaming a bucket would silently repoint every historical photo |
| `mime_tip` | The **sniffed** type, never the declared one |
| `sha256` | Integrity, and the basis for duplicate detection when that arrives |
| `istice_at` | Staging deadline; null once claimed. A check constraint forbids a row that is both unclaimed and non-expiring, since nothing could ever collect it |
