# YouTube InnerTube Raw Proxy

Minimal Express server that forwards requests to YouTube's InnerTube API and returns the raw response payload. The proxy keeps only the essentials: request context bootstrap, error passthrough, and CORS support.

## Features\n- Full endpoint reference: [API_DOCUMENTATION.md](API_DOCUMENTATION.md)\n- Filtered JSON responses with only the fields needed for a YouTube-style client (add `?raw=true` to bypass trimming)
- Automatic InnerTube config discovery (apiKey/clientVersion) with caching
- Optional locale overrides via `hl` / `gl`
- Experimental YouTube Music forwarding (`music/` endpoints)

## Install
```bash
npm install
```

## Run
```bash
npm start
# or with auto-reload
npm run dev
```
The server listens on `http://localhost:3009` by default. Override with `PORT` in your environment or `.env`.

## Essential Endpoints
These are enough to mirror the core UX of youtube.com:
- `POST /youtubei/v1/search` - universal search results (videos, channels, playlists)
- `POST /youtubei/v1/player` - watch page metadata, streaming info, captions tokens
- `POST /youtubei/v1/next` - watch-next rail: related, comments tokens, playlist queue
- `POST /youtubei/v1/browse` with `browseId`: `FEwhat_to_watch` (home), `FEtrending` (trending), channel IDs, `VL<playlistId>` (playlist view)
- `POST /youtubei/v1/guide` - sidebar structure (library, subscriptions)

Use `continuation` tokens from responses to paginate comments, shelves, and feeds exactly as the web client does.

### Other Surfaces You'll Likely Need
- Comments pagination: call `next` with the `continuation` obtained from the watch page (sample capture provided)
- Channel tabs beyond "Home": reuse `browse` with `params` from tab metadata inside the initial `browse` response
- Playlists / mixes: `browse` with `VL<playlistId>` for full metadata, `next` continuations for infinite scrolling
- Shorts feeds: request `next` with a Shorts video ID or use `reel/reel_watch_sequence` payloads captured from the web client
- Transcripts: invoke `get_transcript` using the token from `player.captions.playerCaptionsTracklistRenderer.captionTracks[*].baseUrl` or the `serializedShareEntity`
- Live chat: `live_chat/get_live_chat` for polling, `live_chat/send_message` for posting (requires auth tokens)

## Capturing Raw Snapshots
Generate ready-to-inspect JSON for key surfaces:
```bash
npm run capture
```
Outputs land in `api_response/`:
- `search.json`
- `player.json`
- `next.json`
- `comments_page1.json`
- `guide.json`
- `home.json`
- `trending.json`
- `browse_channel.json`
- `playlist.json`
Each file includes the request payload and the full InnerTube response so you can feed mock data into a frontend clone. Continuation tokens inside these payloads let you script additional pagination layers as needed.

## Usage
Send POST requests to `/youtubei/v1/<endpoint>` with the same JSON payload that the InnerTube API expects. The proxy adds the required client context when it is missing.

```bash
curl -X POST \
  'http://localhost:3009/youtubei/v1/search' \
  -H 'Content-Type: application/json' \
  -d '{
        "query": "lofi",
        "params": "EgIQAQ%3D%3D"
      }'
```

### Locale Overrides
Provide `hl` and `gl` either in the query string or inside the payload context:
```bash
curl -X POST 'http://localhost:3009/youtubei/v1/next?hl=vi&gl=VN' \
  -H 'Content-Type: application/json' \
  -d '{"videoId": "dQw4w9WgXcQ"}'
```

### YouTube Music
Forward requests to `music.youtube.com` by POSTing to `/youtubei/v1/music/<endpoint>` and including a valid music payload:
```bash
curl -X POST 'http://localhost:3009/youtubei/v1/music/get_search_suggestions' \
  -H 'Content-Type: application/json' \
  -d '{"input": "keshi"}'
```
(Some music endpoints require tokens collected from the official web client.)

## Error Handling
Upstream errors are forwarded with the original status code and payload, so clients can inspect InnerTube error structures directly.

## License
MIT


