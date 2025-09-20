# API Quick Reference (Frontend Focus)

The proxy sits at `http://localhost:3009` and forwards requests to YouTube’s InnerTube API. All calls are `POST /youtubei/v1/<endpoint>` with JSON bodies copied from or modeled after the official web client. Responses are trimmed to the fields listed below so that the frontend receives stable, well-defined data. Add `?raw=true` (or `raw=1`) to any request if you need the untouched InnerTube payload.

## Shared Notes
- Locale: supply `hl` / `gl` as query params or inside `context.client`.
- Continuations: whenever a response includes `continuation`, replay the same endpoint with `{ "continuation": "..." }`.
- Thumbnails: always returned as `{ url, width, height }` arrays.

## Endpoints

### `/youtubei/v1/search`
**Purpose:** Universal search (videos, channels, playlists).  
**Payload keys:** `query`, optional `params` (encoded filters), optional `continuation`.  
**Response shape:**
- `query`: echoed search term.
- `estimatedResults`: numeric hint from YouTube.
- `results[]`:
  - `type`: `video | channel | playlist`.
  - Shared fields: `id`, `title`, `thumbnails[]`.
  - Video extras: `descriptionSnippet`, `channel { id, name, badges[] }`, `stats { views, publishedTime, lengthText, lengthSeconds }`, `badges[]`, `isLive`.
  - Channel extras: `subscriberCount`, `descriptionSnippet`, `badges[]`.
  - Playlist extras: `videoCount`, `channel { id, name }`.
- `continuation`: token for next page.

### `/youtubei/v1/player`
**Purpose:** Primary video metadata and streaming formats.  
**Payload keys:** `videoId` (required), optional `playbackContext`, `racyCheckOk`, `contentCheckOk`.  
**Response shape:**
- `video`: `{ id, title, description, keywords[], thumbnails[], durationSeconds, isLive, channel { id, name, url } }`.
- `stats`: `{ viewCount, averageRating }`.
- `publish`: `{ uploadDate, publishDate, category }`.
- `streaming`:
  - `formats[]`: progressive streams (itag, mimeType, quality, qualityLabel, bitrate, audioQuality, url).
  - `adaptiveFormats[]`: DASH/HLS segments (itag, mimeType, bitrate, width, height, fps, audioQuality, approxDurationMs).
  - `dashManifestUrl`, `hlsManifestUrl`.
- `captions[]`: `{ languageCode, name, kind, isTranslatable, url }`.

### `/youtubei/v1/next`
Used for watch-page data and for any continuation coming from the watch page.

#### Initial request (`{ "videoId": "..." }`)
- `metadata`: `{ title, viewCount, publishDate, likeCount }` from the primary info renderer.
- `channel`: `{ id, name, subscribers, thumbnails[] }` for the video owner.
- `relatedVideos`: `{ items[], continuation }` where `items[]` mirrors the trimmed video shape used in search (includes Shorts pulled from lockups; duplicates removed).
- `comments`: `{ continuation }` – token for the first batch of comments.

#### Comment continuation (`{ "continuation": "..." }`)
- `comments[]`: each comment is trimmed to `{ id, content, publishedTime, likeCount, likeCountText, author { id, name, avatar, badges[], isVerified, isCreator }, replyCount, replyCountText, repliesToken }`.
- `continuation`: next page token (if present).
- Response payload: `{ comments, continuation }` so the frontend can append batches without additional parsing.

#### Related videos continuation (`{ "continuation": "..." }`)
- `relatedVideos`: `{ items[], continuation }` using the same trimmed video objects returned by the initial watch payload (videos, Shorts, playlists deduped).
- `items[]` honors the `type` field so the frontend can render videos and Shorts consistently.

Other continuations (e.g. playlist queue) are forwarded raw; set `?raw=true` if you need to inspect them.

### `/youtubei/v1/browse`
**Purpose:** Multi-surface endpoint (home feed, trending, channels, playlists, continuations).  
**Payload keys:** `browseId`, optional `params`, optional `continuation`.  
**Response shape depends on `browseId`:**
- Feed (`FEwhat_to_watch`, `FEtrending`, etc.): `{ browseId, title, items[], continuation }` where `items[]` are videos/shorts with the same trimmed structure as search.
- Playlist (`VL<playlistId>`):
  - `playlist`: `{ id, title, description, owner, ownerId, stats[], thumbnails[] }`.
  - `videos[]`: `{ id, title, lengthText, thumbnails[], index, isPlayable, channel { id, name } }`.
  - `continuation`: token for additional items.
- Channel (`UC...`):
  - `channel`: `{ id, title, description, subscriberCount, avatar[], banners[] }`.
  - `featuredVideo`: trimmed video object (or `null`).
  - `shorts[]`: `{ id, title, thumbnails[], viewCount }` from the Shorts shelf.
  - `tabs[]`: `{ title, params, endpoint, items[], continuation }` – each tab contains a video/short list ready for rendering.
- Continuation payloads (`{ "continuation": "..." }`): returns `{ browseId, items[], continuation }` matching the feed shape.

### `/youtubei/v1/guide`
**Purpose:** Sidebar navigation (Library, Subscriptions, Explore, etc.).  
**Response:** `{ sections: [{ title, items: [{ title, icon, endpoint }] }] }` where `endpoint` is already normalized to `{ type: 'browse' | 'watch', ... }`.

### `/youtubei/v1/get_search_suggestions`
**Purpose:** Autocomplete suggestions for the search box.  
**Payload:** `{ "input": "partial query" }`.  
**Response:** `{ query, suggestions: [{ text, type: 'suggestion' }], totalSuggestions }`.

## Comments Flow Recap
1. Call `/youtubei/v1/next` with `videoId` to get the watch payload and initial comment `continuation`.
2. Replay `/youtubei/v1/next` with `{ "continuation": token }` whenever you need more comments; each response returns `{ comments, continuation }` matching the trimmed comment shape above.
3. To expand replies, call `/youtubei/v1/next` with the `repliesToken` that accompanies each comment.

## Load More Recap
- Related videos: call `/youtubei/v1/next` with the `relatedVideos.continuation` token to append the same trimmed video objects.
- Home/Trending (and other feeds): call `/youtubei/v1/browse` with the feed `browseId` and `continuation` to receive `{ browseId, items[], continuation }`.

## Shorts & Reels
- Channel browse responses expose Shorts in `shorts[]`.
- For standalone reels endpoints (`reel_watch_sequence`, etc.), capture the payload from the official client and reuse it; switch to raw mode for debugging.

## Captured Fixtures
`npm run capture` writes curated responses to `api_response/`. These mirror the trimmed structures above and are suitable for frontend mocks:
- `search.json`, `player.json`, `next.json`, `comments_page1.json`, `guide.json`, `home.json`, `trending.json`, `browse_channel.json`, `playlist.json`.
