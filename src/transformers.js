import { getText, parseThumbnails, parseBadges, parsePublishedTime, parseViewCount, parseDuration, parseNavigationEndpoint, extractContinuationToken } from "./utils/parsers.js";

function parseVideoRenderer(renderer) {
  if (!renderer) return null;
  const channelRun = renderer.ownerText?.runs?.[0];
  const lengthSeconds = renderer.lengthSeconds || renderer.lengthText?.simpleText || null;

  return {
    type: "video",
    id: renderer.videoId,
    title: getText(renderer.title),
    descriptionSnippet: getText(renderer.detailedMetadataSnippets?.[0]?.snippetText),
    thumbnails: parseThumbnails(renderer.thumbnail?.thumbnails),
    channel: channelRun ? {
      id: channelRun.navigationEndpoint?.browseEndpoint?.browseId || null,
      name: channelRun.text || null,
      badges: parseBadges(renderer.ownerBadges)
    } : null,
    stats: {
      views: parseViewCount(renderer),
      publishedTime: parsePublishedTime(renderer),
      lengthText: parseDuration(renderer),
      lengthSeconds: lengthSeconds ? Number(lengthSeconds) || lengthSeconds : null
    },
    badges: parseBadges(renderer.badges),
    isLive: Boolean(renderer.badges?.some(badge => badge?.metadataBadgeRenderer?.label?.toLowerCase().includes("live")))
  };
}

function parseCompactVideoRenderer(renderer) {
  if (!renderer) return null;
  return {
    type: "video",
    id: renderer.videoId,
    title: getText(renderer.title),
    thumbnails: parseThumbnails(renderer.thumbnail?.thumbnails),
    channel: {
      id: renderer.channelId || renderer.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || null,
      name: getText(renderer.longBylineText)
    },
    stats: {
      views: parseViewCount(renderer),
      publishedTime: parsePublishedTime(renderer),
      lengthText: parseDuration(renderer)
    },
    badges: parseBadges(renderer.badges)
  };
}

function parsePlaylistRenderer(renderer) {
  if (!renderer) return null;
  const ownerRun = renderer.ownerText?.runs?.[0];
  return {
    type: "playlist",
    id: renderer.playlistId,
    title: getText(renderer.title),
    videoCount: renderer.videoCount || renderer.videoCountShortText?.simpleText || null,
    thumbnails: parseThumbnails(renderer.thumbnails?.[0]?.thumbnails || renderer.thumbnail?.thumbnails),
    channel: ownerRun ? {
      id: ownerRun.navigationEndpoint?.browseEndpoint?.browseId || null,
      name: ownerRun.text
    } : null
  };
}

function parseLockupViewModel(lockup) {
  if (!lockup) return null;

  const title = getText(lockup.metadata?.lockupMetadataViewModel?.title);
  const imageSources = lockup.contentImage?.thumbnailViewModel?.image?.sources || [];
  const thumbnails = parseThumbnails(imageSources);

  const metadataRows = lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
  const channelPart = metadataRows[0]?.metadataParts?.[0];
  const statsParts = metadataRows[1]?.metadataParts || [];

  const channel = channelPart ? {
    id: channelPart?.navigationEndpoint?.browseEndpoint?.browseId
      || lockup.metadata?.lockupMetadataViewModel?.image?.decoratedAvatarViewModel?.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint?.browseId
      || null,
    name: getText(channelPart?.text)
  } : null;

  const views = getText(statsParts[0]?.text);
  const published = getText(statsParts[1]?.text);

  return {
    type: lockup.contentType === 'LOCKUP_CONTENT_TYPE_SHORT' ? 'short' : 'video',
    id: lockup.contentId,
    title,
    thumbnails,
    channel,
    stats: {
      views: views || null,
      publishedTime: published || null
    }
  };
}

function parseChannelRenderer(renderer) {
  if (!renderer) return null;
  return {
    type: "channel",
    id: renderer.channelId,
    title: getText(renderer.title),
    descriptionSnippet: getText(renderer.descriptionSnippet),
    subscriberCount: getText(renderer.subscriberCountText),
    thumbnails: parseThumbnails(renderer.thumbnail?.thumbnails),
    badges: parseBadges(renderer.ownerBadges)
  };
}

function parseCountToNumber(value) {
  if (!value) return null;
  const normalized = value.toString().trim().replace(/,/g, '').toUpperCase();
  const match = normalized.match(/^([0-9]+(?:.[0-9]+)?)([KMB])?$/);
  if (!match) {
    const direct = parseInt(normalized, 10);
    return Number.isFinite(direct) ? direct : null;
  }
  const number = parseFloat(match[1]);
  if (!Number.isFinite(number)) return null;
  const suffix = match[2];
  const multiplier = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1;
  return Math.round(number * multiplier);
}

function collectContinuation(contents) {
  if (!Array.isArray(contents)) return null;
  for (const item of contents) {
    if (item?.continuationItemRenderer) {
      return extractContinuationToken(item.continuationItemRenderer);
    }
  }
  return null;
}

function transformSearch(data, payload) {
  const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const results = [];

  for (const section of sections) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      if (item.videoRenderer) {
        const parsed = parseVideoRenderer(item.videoRenderer);
        if (parsed) results.push(parsed);
      } else if (item.channelRenderer) {
        const parsed = parseChannelRenderer(item.channelRenderer);
        if (parsed) results.push(parsed);
      } else if (item.playlistRenderer) {
        const parsed = parsePlaylistRenderer(item.playlistRenderer);
        if (parsed) results.push(parsed);
      }
    }
  }

  const continuation = extractContinuationToken(sections);

  return {
    query: payload?.query || null,
    estimatedResults: Number(data?.estimatedResults) || null,
    results,
    continuation
  };
}

function transformPlayer(data) {
  const details = data?.videoDetails || {};
  const micro = data?.microformat?.playerMicroformatRenderer || {};
  const streaming = data?.streamingData || {};

  const formats = (streaming.formats || []).map(format => ({
    itag: format.itag,
    mimeType: format.mimeType,
    quality: format.quality,
    qualityLabel: format.qualityLabel,
    bitrate: format.bitrate,
    audioQuality: format.audioQuality || null,
    url: format.url || null
  }));

  const adaptiveFormats = (streaming.adaptiveFormats || []).map(format => ({
    itag: format.itag,
    mimeType: format.mimeType,
    bitrate: format.bitrate,
    width: format.width,
    height: format.height,
    fps: format.fps,
    audioQuality: format.audioQuality || null,
    approxDurationMs: format.approxDurationMs
  }));

  const captions = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

  return {
    video: {
      id: details.videoId,
      title: details.title,
      description: details.shortDescription,
      keywords: details.keywords || [],
      thumbnails: parseThumbnails(details.thumbnail?.thumbnails),
      durationSeconds: Number(details.lengthSeconds) || null,
      isLive: Boolean(details.isLiveContent),
      channel: {
        id: details.channelId,
        name: details.author,
        url: micro.ownerProfileUrl || null
      }
    },
    stats: {
      viewCount: Number(details.viewCount) || null,
      averageRating: details.averageRating || null
    },
    publish: {
      uploadDate: micro.uploadDate || null,
      publishDate: micro.publishDate || null,
      category: micro.category || null
    },
    streaming: {
      formats,
      adaptiveFormats,
      dashManifestUrl: streaming.dashManifestUrl || null,
      hlsManifestUrl: streaming.hlsManifestUrl || null
    },
    captions: captions.map(track => ({
      languageCode: track.languageCode,
      name: getText(track.name),
      kind: track.kind || null,
      isTranslatable: Boolean(track.isTranslatable),
      url: track.baseUrl
    }))
  };
}

function findCommentContinuation(data) {
  if (!data) return null;
  const responseEndpoints = data.onResponseReceivedEndpoints || [];

  for (const endpoint of responseEndpoints) {
    const append = endpoint.appendContinuationItemsAction?.continuationItems;
    if (Array.isArray(append)) {
      for (const item of append) {
        if (item.continuationItemRenderer) {
          const token = extractContinuationToken(item.continuationItemRenderer);
          if (token) return token;
        }
      }
    }
  }

  const contents = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
  for (const item of contents) {
    const commentsHeader = item.itemSectionRenderer;
    if (!commentsHeader) continue;
    const continuation = extractContinuationToken(commentsHeader);
    if (continuation) return continuation;
  }

  return null;
}

function containsCommentThread(data) {
  if (!data || typeof data !== "object") return false;
  if (data?.continuationContents?.commentSectionContinuation) return true;

  const endpoints = data.onResponseReceivedEndpoints || [];
  for (const endpoint of endpoints) {
    const items = endpoint.appendContinuationItemsAction?.continuationItems
      || endpoint.reloadContinuationItemsCommand?.continuationItems
      || [];
    if (items.some(item => item.commentThreadRenderer)) {
      return true;
    }
  }
  return false;
}


function buildCommentEntityMap(frameworkUpdates) {
  const map = new Map();
  const mutations = frameworkUpdates?.entityBatchUpdate?.mutations || [];

  for (const mutation of mutations) {
    const payload = mutation.payload?.commentEntityPayload;
    if (!payload) continue;

    const properties = payload.properties || {};
    const commentId = properties.commentId;
    if (!commentId) continue;

    map.set(commentId, {
      content: getText(properties.content),
      publishedTime: properties.publishedTime || null,
      author: {
        id: payload.author?.channelId || null,
        name: payload.author?.displayName || null,
        avatar: payload.author?.avatarThumbnailUrl || null,
        isVerified: Boolean(payload.author?.isVerified),
        isCreator: Boolean(payload.author?.isCreator)
      },
      likeCountText: payload.toolbar?.likeCountLiked || payload.toolbar?.likeCountNotliked || null,
      replyCountText: payload.toolbar?.replyCount || null
    });
  }

  return map;
}

function transformCommentThread(thread, entityMap = new Map()) {
  const renderer = thread.commentThreadRenderer;
  if (!renderer) return null;

  const comment = renderer.comment?.commentRenderer
    || renderer.comment?.commentViewModel
    || renderer.commentViewModel?.commentViewModel;
  if (!comment) return null;

  const authorRun = comment.authorText?.runs?.[0] || comment.authorText?.runs?.[0]?.run || null;
  const contentRuns = comment.contentText?.runs || comment.commentText?.runs;

  const replyToken = renderer.replies?.commentRepliesRenderer?.continuations?.[0]?.nextContinuationData?.continuation
    || renderer.replies?.commentRepliesRenderer?.continuationEndpoint?.continuationCommand?.token
    || null;

  const simple = comment.voteCount?.simpleText || "";
  const runsText = comment.voteCount?.runs ? comment.voteCount.runs.map(run => run.text || "").join("") : "";
  const rawLikeCount = simple || runsText;

  const commentId = comment.commentId || comment.commentKey;
  const enriched = commentId ? entityMap.get(commentId) : null;

  const likeCountText = enriched?.likeCountText || rawLikeCount || null;
  const replyCountText = enriched?.replyCountText || getText(renderer.replies?.commentRepliesRenderer?.moreText) || null;

  const replyCountNumber = replyCountText ? parseCountToNumber(replyCountText) : renderer.replies?.commentRepliesRenderer?.contents?.length || 0;
  const likeCountNumber = likeCountText ? parseCountToNumber(likeCountText) : null;

  return {
    id: commentId,
    content: enriched?.content || getText(contentRuns || comment.contentText || comment.commentText),
    publishedTime: enriched?.publishedTime || getText(comment.publishedTimeText) || comment.publishedTime || null,
    likeCount: likeCountNumber,
    likeCountText,
    author: {
      id: enriched?.author?.id || authorRun?.navigationEndpoint?.browseEndpoint?.browseId || null,
      name: enriched?.author?.name || authorRun?.text || getText(comment.authorText) || comment.authorDisplayName || "",
      avatar: enriched?.author?.avatar || parseThumbnails(comment.authorThumbnail?.thumbnails)[0]?.url || null,
      badges: parseBadges(comment.authorBadges),
      isVerified: enriched?.author?.isVerified || false,
      isCreator: enriched?.author?.isCreator || false
    },
    replyCount: replyCountNumber,
    replyCountText,
    repliesToken: replyToken || null
  };
}

function transformCommentsContinuation(data) {
  const entityMap = buildCommentEntityMap(data.frameworkUpdates || {});
  const threads = [];
  let continuation = null;

  const endpoints = data.onResponseReceivedEndpoints || [];

  for (const endpoint of endpoints) {
    const appendItems = endpoint.appendContinuationItemsAction?.continuationItems
      || endpoint.reloadContinuationItemsCommand?.continuationItems
      || [];

    for (const item of appendItems) {
      if (item.commentThreadRenderer) {
        const parsed = transformCommentThread(item, entityMap);
        if (parsed) threads.push(parsed);
      } else if (item.continuationItemRenderer) {
        continuation = extractContinuationToken(item.continuationItemRenderer) || continuation;
      }
    }
  }

  if (!threads.length) {
    const contents = data?.continuationContents?.commentSectionContinuation?.contents || [];
    for (const item of contents) {
      if (item.commentThreadRenderer) {
        const parsed = transformCommentThread(item, entityMap);
        if (parsed) threads.push(parsed);
      }
    }
    continuation = continuation || extractContinuationToken(data?.continuationContents?.commentSectionContinuation);
  }

  return {
    comments: threads,
    continuation
  };
}


function transformWatchNextContinuation(data) {
  const videos = [];
  const seen = new Set();
  let continuation = null;

  const endpoints = data?.onResponseReceivedEndpoints || [];
  for (const endpoint of endpoints) {
    const action = endpoint.appendContinuationItemsAction
      || endpoint.reloadContinuationItemsCommand
      || endpoint.replaceContinuationItemsCommand;
    const items = action?.continuationItems || [];
    if (items.length) {
      collectVideoEntries(items, videos, seen);
      if (!continuation) {
        for (const item of items) {
          if (item?.continuationItemRenderer) {
            continuation = extractContinuationToken(item.continuationItemRenderer);
            if (continuation) break;
          }
        }
      }
    }
  }

  if (!videos.length) {
    const continuationContents = data?.continuationContents || null;
    if (continuationContents) {
      const contents = continuationContents.sectionListContinuation?.contents
        || continuationContents.itemSectionContinuation?.contents
        || continuationContents.playlistPanelContinuation?.contents
        || continuationContents.richGridContinuation?.contents
        || continuationContents.gridContinuation?.items
        || [];
      collectVideoEntries(contents, videos, seen);
      if (!continuation) {
        continuation = extractContinuationToken(continuationContents);
      }
    }
  }

  if (!videos.length) {
    return null;
  }

  const fallbackContinuation = extractContinuationToken(data?.onResponseReceivedEndpoints)
    || extractContinuationToken(data?.continuationContents)
    || null;

  return {
    relatedVideos: {
      items: videos,
      continuation: continuation || fallbackContinuation
    }
  };
}

function transformWatchNext(data) {
  const contents = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
  const secondary = data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results || [];

  let primaryInfo = null;
  let channelInfo = null;

  for (const item of contents) {
    if (item.videoPrimaryInfoRenderer) {
      const primary = item.videoPrimaryInfoRenderer;
      primaryInfo = {
        title: getText(primary.title),
        viewCount: getText(primary.viewCount?.videoViewCountRenderer?.viewCount),
        publishDate: getText(primary.dateText),
        likeCount: getText(primary.videoActions?.menuRenderer?.topLevelButtons?.[0]?.segmentedLikeDislikeButtonRenderer?.likeButton?.toggleButtonRenderer?.defaultText)
      };
    }
    if (item.videoSecondaryInfoRenderer) {
      const owner = item.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer;
      if (owner) {
        channelInfo = {
          id: owner.navigationEndpoint?.browseEndpoint?.browseId || owner.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || null,
          name: owner.title?.runs?.[0]?.text || null,
          subscribers: getText(owner.subscriberCountText),
          thumbnails: parseThumbnails(owner.thumbnail?.thumbnails)
        };
      }
    }
  }

  const related = [];
  const seenRelated = new Set();
  for (const item of secondary) {
    if (item.compactVideoRenderer) {
      const parsed = parseCompactVideoRenderer(item.compactVideoRenderer);
      if (parsed && (!parsed.id || !seenRelated.has(parsed.id))) {
        if (parsed.id) seenRelated.add(parsed.id);
        related.push(parsed);
      }
      continue;
    }
    if (item.lockupViewModel) {
      const parsed = parseLockupViewModel(item.lockupViewModel);
      if (parsed && (!parsed.id || !seenRelated.has(parsed.id))) {
        if (parsed.id) seenRelated.add(parsed.id);
        related.push(parsed);
      }
      continue;
    }
    collectVideoEntries(item, related, seenRelated);
  }

  const commentContinuation = findCommentContinuation(data);
  const relatedContinuation = extractContinuationToken(secondary);

  return {
    metadata: primaryInfo,
    channel: channelInfo,
    relatedVideos: {
      items: related,
      continuation: relatedContinuation
    },
    comments: {
      continuation: commentContinuation
    }
  };
}

function transformGuide(data) {
  const items = data?.items || [];
  const sections = [];

  for (const entry of items) {
    const section = entry.guideSectionRenderer;
    if (!section) continue;
    const sectionItems = [];
    for (const item of section.items || []) {
      const renderer = item.guideEntryRenderer;
      if (!renderer) continue;
      sectionItems.push({
        title: getText(renderer.formattedTitle),
        icon: renderer.icon?.iconType || null,
        endpoint: parseNavigationEndpoint(renderer.navigationEndpoint),
        isPrimary: Boolean(renderer.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl)
      });
    }
    sections.push({
      title: getText(section.title),
      items: sectionItems
    });
  }

  return { sections };
}

function collectVideoEntries(node, collection, seen) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach(item => collectVideoEntries(item, collection, seen));
    return;
  }
  if (typeof node !== "object") return;

  if (node.videoRenderer) {
    const parsed = parseVideoRenderer(node.videoRenderer);
    if (parsed && (!parsed.id || !seen?.has(parsed.id))) {
      if (parsed.id && seen) seen.add(parsed.id);
      collection.push(parsed);
    }
  }

  if (node.gridVideoRenderer) {
    const parsed = parseVideoRenderer(node.gridVideoRenderer);
    if (parsed && (!parsed.id || !seen?.has(parsed.id))) {
      if (parsed.id && seen) seen.add(parsed.id);
      collection.push(parsed);
    }
  }

  if (node.compactVideoRenderer) {
    const parsed = parseCompactVideoRenderer(node.compactVideoRenderer);
    if (parsed && (!parsed.id || !seen?.has(parsed.id))) {
      if (parsed.id && seen) seen.add(parsed.id);
      collection.push(parsed);
    }
  }

  if (node.lockupViewModel) {
    const parsed = parseLockupViewModel(node.lockupViewModel);
    if (parsed && (!parsed.id || !seen?.has(parsed.id))) {
      if (parsed.id && seen) seen.add(parsed.id);
      collection.push(parsed);
    }
  }

  if (node.playlistVideoRenderer) {
    const parsed = parseVideoRenderer(node.playlistVideoRenderer);
    if (parsed && (!parsed.id || !seen?.has(parsed.id))) {
      if (parsed.id && seen) seen.add(parsed.id);
      collection.push(parsed);
    }
  }

  if (node.richItemRenderer?.content) {
    collectVideoEntries(node.richItemRenderer.content, collection, seen);
  }

  if (node.itemSectionRenderer?.contents) {
    collectVideoEntries(node.itemSectionRenderer.contents, collection, seen);
  }

  if (node.richSectionRenderer?.content) {
    collectVideoEntries(node.richSectionRenderer.content, collection, seen);
  }

  if (node.shelfRenderer?.content) {
    collectVideoEntries(node.shelfRenderer.content, collection, seen);
  }

  if (node.gridRenderer?.items) {
    collectVideoEntries(node.gridRenderer.items, collection, seen);
  }

  if (node.sectionListRenderer?.contents) {
    collectVideoEntries(node.sectionListRenderer.contents, collection, seen);
  }

  if (node.richGridRenderer?.contents) {
    collectVideoEntries(node.richGridRenderer.contents, collection, seen);
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      collectVideoEntries(value, collection, seen);
    }
  }
}

function collectVideosFromContents(contents = []) {
  const videos = [];
  const seen = new Set();
  collectVideoEntries(contents, videos, seen);
  return videos;
}

function transformFeedBrowse(data, browseId) {
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  const firstTab = tabs[0]?.tabRenderer;
  const contents = firstTab?.content?.richGridRenderer?.contents || firstTab?.content?.sectionListRenderer?.contents || [];
  const videos = collectVideosFromContents(contents);
  const continuation = extractContinuationToken(firstTab?.content);

  const headerTitle = getText(data?.header?.feedTabbedHeaderRenderer?.title)
    || getText(data?.header?.richHeaderRenderer?.title)
    || getText(firstTab?.title)
    || null;

  return {
    browseId,
    title: headerTitle,
    items: videos,
    continuation
  };
}

function transformPlaylistBrowse(data, browseId) {
  const sidebar = data?.sidebar?.playlistSidebarRenderer?.items || [];
  const first = sidebar[0]?.playlistSidebarPrimaryInfoRenderer;
  const secondary = sidebar[1]?.playlistSidebarSecondaryInfoRenderer;

  const metadata = {
    id: browseId.replace(/^VL/, ""),
    title: getText(first?.title),
    description: getText(secondary?.description),
    owner: getText(first?.owner?.text),
    ownerId: first?.owner?.navigationEndpoint?.browseEndpoint?.browseId || null,
    stats: first?.stats?.map(stat => getText(stat)) || [],
    thumbnails: parseThumbnails(first?.thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails)
  };

  const contents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  const videos = [];
  let continuation = null;

  for (const section of contents) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      if (item.playlistVideoListRenderer) {
        for (const videoItem of item.playlistVideoListRenderer.contents || []) {
          if (videoItem.playlistVideoRenderer) {
            const renderer = videoItem.playlistVideoRenderer;
            videos.push({
              id: renderer.videoId,
              title: getText(renderer.title),
              lengthText: parseDuration(renderer),
              thumbnails: parseThumbnails(renderer.thumbnail?.thumbnails),
              index: renderer.index?.simpleText || renderer.index || null,
              isPlayable: renderer.isPlayable,
              channel: {
                id: renderer.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || null,
                name: getText(renderer.shortBylineText)
              }
            });
          } else if (videoItem.continuationItemRenderer) {
            continuation = extractContinuationToken(videoItem.continuationItemRenderer) || continuation;
          }
        }
      }
    }
  }

  return {
    browseId,
    playlist: metadata,
    videos,
    continuation
  };
}

function transformChannelBrowse(data, browseId) {
  const header = data?.header?.c4TabbedHeaderRenderer;
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];

  const channel = {
    id: browseId,
    title: getText(header?.title),
    description: getText(header?.description),
    subscriberCount: getText(header?.subscriberCountText),
    banners: parseThumbnails(header?.banner?.thumbnails),
    avatar: parseThumbnails(header?.avatar?.thumbnails)
  };

  const tabSummaries = tabs.map(tab => {
    const renderer = tab.tabRenderer;
    if (!renderer) return null;
    const tabContent = renderer.content?.richGridRenderer?.contents
      || renderer.content?.sectionListRenderer?.contents
      || [];
    const videos = collectVideosFromContents(tabContent);
    const continuation = extractContinuationToken(renderer.content);

    return {
      title: getText(renderer.title),
      params: renderer.endpoint?.browseEndpoint?.params || null,
      endpoint: parseNavigationEndpoint(renderer.endpoint),
      items: videos,
      continuation
    };
  }).filter(Boolean);

  return {
    browseId,
    channel,
    tabs: tabSummaries
  };
}

function transformBrowse(data, payload) {
  const browseId = payload?.browseId || data?.header?.c4TabbedHeaderRenderer?.channelId || null;

  if (payload?.continuation) {
    const collection = [];
    const seen = new Set();
    collectVideoEntries(data?.continuationContents || data, collection, seen);
    const continuation = extractContinuationToken(data?.continuationContents || data);
    return {
      browseId,
      items: collection,
      continuation
    };
  }

  if (!browseId) {
    return data;
  }

  if (browseId.startsWith("VL")) {
    return transformPlaylistBrowse(data, browseId);
  }

  if (browseId.startsWith("UC") || browseId.startsWith("HC")) {
    return transformChannelBrowse(data, browseId);
  }

  return transformFeedBrowse(data, browseId);
}

function transformResponse(endpoint, data, payload = {}) {
  if (!data || typeof data !== "object") {
    return data;
  }

  const normalized = endpoint.toLowerCase();

  if (normalized.startsWith("music/")) {
    return data; // leave music endpoints raw for now
  }

  try {
    if (normalized === "search") {
      return transformSearch(data, payload);
    }
    if (normalized === "player") {
      return transformPlayer(data, payload);
    }
    if (normalized === "next") {
      if (payload?.continuation) {
        if (containsCommentThread(data)) {
          return transformCommentsContinuation(data, payload);
        }
        const continuationPayload = transformWatchNextContinuation(data);
        if (continuationPayload) {
          return continuationPayload;
        }
        return data;
      }
      return transformWatchNext(data, payload);
    }
    if (normalized === "guide") {
      return transformGuide(data, payload);
    }
    if (normalized === "browse") {
      return transformBrowse(data, payload);
    }
  } catch (error) {
    console.warn(`transformResponse(${endpoint}) failed:`, error.message);
    return data;
  }

  return data;
}

export { transformResponse };





























