export function getText(input) {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (Array.isArray(input)) {
    return input.map(getText).filter(Boolean).join("");
  }
    if (typeof input === "object") {
    if (Array.isArray(input.runs)) {
      return input.runs.map(run => run.text || "").join("");
    }
    if (typeof input.simpleText === "string") {
      return input.simpleText;
    }
    if (typeof input.content === "string") {
      return input.content;
    }
    if (input.accessibility?.accessibilityData?.label) {
      return input.accessibility.accessibilityData.label;
    }
    if (input.accessibilityData?.label) {
      return input.accessibilityData.label;
    }
    if (input.text) {
      return getText(input.text);
    }
  }
  return "";
}

export function parseThumbnails(thumbnails = []) {
  if (!Array.isArray(thumbnails)) return [];
  return thumbnails
    .map(({ url, width, height }) => ({ url, width, height }))
    .filter(item => item.url);
}

export function parseBadges(badges = []) {
  if (!Array.isArray(badges)) return [];
  return badges
    .map(badge => badge?.metadataBadgeRenderer?.label || badge?.metadataBadgeRenderer?.tooltip)
    .filter(Boolean);
}

export function parsePublishedTime(node) {
  return getText(node?.publishedTimeText) || getText(node?.publishedTimeTextV2) || getText(node?.timeText);
}

export function parseViewCount(node) {
  return getText(node?.viewCountText) || getText(node?.shortViewCountText) || getText(node?.viewCount);
}

export function parseDuration(node) {
  return getText(node?.lengthText) || getText(node?.thumbnailOverlays?.find(overlay => overlay.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text);
}

export function parseNavigationEndpoint(endpoint) {
  const browse = endpoint?.browseEndpoint;
  if (browse) {
    return {
      type: "browse",
      browseId: browse.browseId,
      params: browse.params || null
    };
  }
  const watch = endpoint?.watchEndpoint;
  if (watch) {
    return {
      type: "watch",
      videoId: watch.videoId,
      playlistId: watch.playlistId || null
    };
  }
  return null;
}

export function extractContinuationToken(node) {
  if (!node || typeof node !== "object") {
    return null;
  }
    if (node.continuationEndpoint) {
    const { continuationCommand, reloadContinuationData, nextContinuationData } = node.continuationEndpoint;
    if (continuationCommand?.token) {
      return continuationCommand.token;
    }
    if (reloadContinuationData?.continuation) {
      return reloadContinuationData.continuation;
    }
    if (nextContinuationData?.continuation) {
      return nextContinuationData.continuation;
    }
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const token = extractContinuationToken(item);
        if (token) return token;
      }
    } else if (value && typeof value === "object") {
      const token = extractContinuationToken(value);
      if (token) return token;
    }
  }

  return null;
}



