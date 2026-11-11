# News feed

Outbound information from the utility to citizens: schedule changes, clean-up
actions, container placements, sorting guidance. The seventh requirement of the
challenge ("information and education") reaches people through this feed.

The inbound direction is [`reports-mvp.md`](reports-mvp.md); this page is the
same relationship read the other way.

## What a post is

One table, `app.vest` (migration `20260919120000_vesti.sql`).

| Column | Meaning |
|---|---|
| `naslov`, `sadrzaj` | Headline and body. Line breaks are content: the feed renders them. |
| `slika_url` | Link to an already hosted image. **There is no upload endpoint**, the same open question `prijava_foto` carries. |
| `kategorija` | `obavestenje` / `akcija` / `raspored` / `edukacija` — drives the badge and icon, nothing else. |
| `naselje_id` | The settlement the post is about. `NULL` is the whole municipality and is the common case. |
| `zakacena` | Pinned above newer posts. |
| `sms_tekst` | The same news for citizens without a smartphone. `NULL` is a decision, not a gap. |
| `autor` | The signature citizens see: a service, never a person. |
| `objavio_korisnik_id` | Which staff account published it. Internal; no response DTO exposes it. |
| `objavljena_at`, `azurirana_at`, `verzija` | Publication, last edit, optimistic-locking version. |

## Rules that are not obvious from the columns

**A settlement post is a filter, not a permission.** `naselje_id` narrows a feed;
it never restricts who may read a post. `GET /news?naselje_id=X` deliberately
returns the settlement's posts **plus** the municipality-wide ones — a village
feed without "no collection on the holiday" is missing the half that matters.

**Pinned outranks new.** A schedule change has to survive a week of other news,
which a date-only order cannot express. Feed order is
`zakacena desc, objavljena_at desc, id desc`, and `vest_feed_idx` is exactly that
order so the API never sorts in memory.

**Editing does not move `objavljena_at`.** The feed is not a list of recent
edits: a typo fix must not jump over a post published in the meantime.
`azurirana_at` stays `NULL` until the first edit, because "never edited" and
"edited at publication time" are different facts and the feed shows the
difference.

**One SMS, never two.** A GSM-7 message carries 160 characters. A single Serbian
diacritic — č, ć, š, ž, đ — forces UCS-2 encoding and the limit drops to **70**,
so the same sentence is one message without diacritics and three with them. The
utility pays per message and per settlement. Enforced twice: the
`vest_sms_valid` check constraint, and `news.sms.ts` so the API can explain the
refusal instead of surfacing a constraint violation.

**Publishing is admin-only.** A post reaches every citizen and an SMS that has
gone out cannot be recalled, so it is not a dispatcher's routine action
(`AdminOnly` in `auth.guard.ts`). Reading is public and unauthenticated: the
citizen feed has no accounts.

**Deleting is unversioned.** Unlike an edit there is nothing to merge. It also
does not recall messages already sent — the API says so in the endpoint
description, and the UI should repeat it before the confirm button.

## API

| Method | Path | operationId | Access |
|---|---|---|---|
| GET | `/news` | `listNews` | public; `page`, `limit`, `naselje_id`, `kategorija` |
| POST | `/news` | `createNews` | admin |
| PATCH | `/news/{id}` | `updateNews` | admin; requires `verzija`, 409 on a stale one |
| DELETE | `/news/{id}` | `deleteNews` | admin; 204, or 404 if it was already gone |

`PATCH` is also how a post is pinned and unpinned (`zakacena`), and how a field
is cleared: an omitted key keeps the current value, an explicit `null` removes
it. Collapsing those two cases would make it impossible to remove an image.

## Not yet decided

- **Image upload.** `slika_url` takes a link because object storage is off.
  Whatever answers this for `prijava_foto` answers it here.
- **Actually sending the SMS.** `sms_tekst` is stored and shown; no dispatcher
  writes `obavestenje` rows from it yet. Until it does, the SMS path is a
  promise the database keeps and the network does not.
- **Who receives which post.** `pretplata` already models subscriptions per
  settlement and channel; the feed does not read it yet.
