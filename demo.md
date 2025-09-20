// processors/channelProcessor.js

/**
 * Trích xuất dữ liệu chi tiết và tiềm năng từ tệp browse_channel.json.
 * @param {object} rawData - Dữ liệu JSON thô.
 * @returns {object} - Dữ liệu kênh đã được xử lý chi tiết.
 */
function processChannelData(rawData) {
    const header = rawData.data.header.c4TabbedHeaderRenderer;
    const tabs = rawData.data.contents.twoColumnBrowseResultsRenderer.tabs;
    const homeTabContent = tabs[0].tabRenderer.content.sectionListRenderer.contents;
    
    // Tìm kệ chứa video nổi bật và shorts
    const featuredContent = homeTabContent.find(c => c.itemSectionRenderer?.contents[0]?.channelFeaturedContentRenderer)?.itemSectionRenderer.contents[0].channelFeaturedContentRenderer;
    const shortsShelf = homeTabContent.find(c => c.itemSectionRenderer?.contents[0]?.reelShelfRenderer)?.itemSectionRenderer.contents[0].reelShelfRenderer;

    const extractVideoDetails = (videoRenderer) => {
        if (!videoRenderer) return null;
        return {
            videoId: videoRenderer.videoId,
            title: videoRenderer.title.runs.map(r => r.text).join(''),
            thumbnails: videoRenderer.thumbnail.thumbnails,
            viewCountText: videoRenderer.viewCountText?.simpleText || 'N/A',
            publishedTimeText: videoRenderer.publishedTimeText?.simpleText || 'N/A',
            descriptionSnippet: videoRenderer.descriptionSnippet?.runs.map(r => r.text).join('') || null,
            lengthText: videoRenderer.lengthText?.simpleText || 'N/A',
            trackingParams: videoRenderer.trackingParams,
            navigationEndpoint: videoRenderer.navigationEndpoint
        };
    };

    return {
        channelId: header.channelId,
        channelName: header.title,
        subscriberCountText: header.subscriberCountText.simpleText,
        banner: header.banner.thumbnails,
        avatar: header.avatar.thumbnails,
        trackingParams: header.trackingParams,
        // Lấy các tab điều hướng của kênh (Home, Videos, Shorts, etc.)
        navigationTabs: tabs.map(tabWrapper => ({
            title: tabWrapper.tabRenderer.title,
            selected: tabWrapper.tabRenderer.selected,
            endpoint: tabWrapper.tabRenderer.endpoint,
            trackingParams: tabWrapper.tabRenderer.trackingParams
        })),
        featuredVideo: extractVideoDetails(featuredContent?.items[0]?.videoRenderer),
        shorts: shortsShelf ? shortsShelf.items.map(item => ({
            videoId: item.reelItemRenderer.videoId,
            headline: item.reelItemRenderer.headline.simpleText,
            viewCountText: item.reelItemRenderer.viewCountText.simpleText,
            thumbnails: item.reelItemRenderer.thumbnail.thumbnails,
            navigationEndpoint: item.reelItemRenderer.navigationEndpoint,
            trackingParams: item.reelItemRenderer.trackingParams,
        })) : [],
    };
}

module.exports = { processChannelData };
// processors/watchProcessor.js

/**
 * Trích xuất dữ liệu chi tiết từ player.json.
 * @param {object} playerData - Dữ liệu JSON thô.
 * @returns {object} - Dữ liệu trình phát chi tiết.
 */
function processPlayerData(playerData) {
    const details = playerData.data.videoDetails;
    const microformat = playerData.data.microformat.playerMicroformatRenderer;

    return {
        videoId: details.videoId,
        title: details.title,
        description: details.shortDescription,
        lengthSeconds: parseInt(details.lengthSeconds, 10),
        keywords: details.keywords,
        channelId: details.channelId,
        author: details.author,
        isOwnerViewing: details.isOwnerViewing,
        isCrawlable: details.isCrawlable,
        isLiveContent: details.isLiveContent,
        thumbnails: details.thumbnail.thumbnails,
        viewCount: parseInt(details.viewCount, 10),
        // Dữ liệu Microformat (quan trọng cho SEO và structured data)
        microformat: {
            category: microformat.category,
            publishDate: microformat.publishDate,
            uploadDate: microformat.uploadDate,
            isFamilySafe: microformat.isFamilySafe,
            availableCountries: microformat.availableCountries,
        },
        trackingParams: playerData.data.trackingParams,
        // Dữ liệu heatmap (cho thấy các phần được xem lại nhiều nhất)
        storyboards: playerData.data.storyboards,
    };
}

/**
 * Trích xuất dữ liệu từ next.json (video đề xuất và thông tin video chính).
 * @param {object} nextData - Dữ liệu JSON thô.
 * @returns {object} - Dữ liệu video chính và danh sách video đề xuất.
 */
function processNextData(nextData) {
    const results = nextData.data.contents.twoColumnWatchNextResults;
    const primaryInfo = results.results.results.contents.find(c => c.videoPrimaryInfoRenderer).videoPrimaryInfoRenderer;
    const secondaryResults = results.secondaryResults.secondaryResults.results;

    const extractCompactVideo = (videoRenderer) => {
        if (!videoRenderer) return null;
        return {
            videoId: videoRenderer.videoId,
            title: videoRenderer.title.simpleText,
            channelName: videoRenderer.longBylineText.runs[0].text,
            channelId: videoRenderer.longBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId,
            viewCountText: videoRenderer.viewCountText?.simpleText || 'N/A',
            lengthText: videoRenderer.lengthText?.simpleText || 'N/A',
            publishedTimeText: videoRenderer.publishedTimeText?.simpleText || 'N/A',
            thumbnails: videoRenderer.thumbnail.thumbnails,
            trackingParams: videoRenderer.trackingParams,
            navigationEndpoint: videoRenderer.navigationEndpoint,
        };
    };

    return {
        primaryVideoInfo: {
            title: primaryInfo.title.runs[0].text,
            likeCount: primaryInfo.videoActions.menuRenderer.topLevelButtons.find(b => b.toggleButtonRenderer.defaultIcon.iconType === 'LIKE')?.toggleButtonRenderer.defaultText.simpleText,
            viewCount: primaryInfo.viewCount.videoViewCountRenderer.viewCount.simpleText,
            uploadDate: primaryInfo.dateText.simpleText,
        },
        recommendedVideos: secondaryResults.map(item => extractCompactVideo(item.compactVideoRenderer)).filter(Boolean),
        // Lấy continuation token để tải thêm bình luận
        commentsContinuation: results.results.results.contents.find(c => c.itemSectionRenderer)?.itemSectionRenderer.contents[0].continuationItemRenderer?.continuationEndpoint,
    };
}

/**
 * Trích xuất dữ liệu bình luận chi tiết.
 * @param {object} commentsData - Dữ liệu JSON thô từ comments_page1.json.
 * @returns {Array} - Danh sách bình luận chi tiết.
 */
function processCommentsData(commentsData) {
    const items = commentsData.data?.onResponseReceivedEndpoints?.[0]?.appendContinuationItemsAction?.continuationItems || [];

    return items.map(item => {
        const comment = item.commentThreadRenderer?.comment?.commentRenderer;
        if (!comment) return null;

        return {
            commentId: comment.commentId,
            author: comment.authorText.simpleText,
            authorChannelId: comment.authorEndpoint.browseEndpoint.browseId,
            authorThumbnails: comment.authorThumbnail.thumbnails,
            commentText: comment.contentText.runs.map(run => run.text).join(''),
            likeCount: comment.voteCount ? comment.voteCount.simpleText : '0',
            publishedTimeText: comment.publishedTimeText.runs[0].text,
            isLiked: comment.isLiked,
            replyCount: comment.replyCount || 0,
            trackingParams: comment.trackingParams,
            // Lấy continuation token để tải thêm trả lời cho bình luận này
            repliesContinuation: item.commentThreadRenderer?.replies?.commentRepliesRenderer.contents[0].continuationItemRenderer?.continuationEndpoint,
        };
    }).filter(Boolean);
}

module.exports = { processPlayerData, processNextData, processCommentsData };
// processors/searchProcessor.js

/**
 * Trích xuất và phân loại kết quả tìm kiếm từ tệp search.json.
 * @param {object} rawData - Dữ liệu JSON thô.
 * @returns {object} - Đối tượng chứa các loại kết quả tìm kiếm.
 */
function processSearchData(rawData) {
    const contents = rawData.data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents;

    const results = {
        videos: [],
        channels: [],
        playlists: [],
    };

    contents.forEach(item => {
        if (item.videoRenderer) {
            const video = item.videoRenderer;
            results.videos.push({
                videoId: video.videoId,
                title: video.title.runs[0].text,
                descriptionSnippet: video.descriptionSnippet?.runs.map(r => r.text).join('') || null,
                thumbnails: video.thumbnail.thumbnails,
                channelName: video.longBylineText.runs[0].text,
                channelId: video.longBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId,
                isChannelVerified: video.ownerBadges?.some(b => b.metadataBadgeRenderer.style === 'BADGE_STYLE_TYPE_VERIFIED'),
                viewCountText: video.viewCountText?.simpleText,
                publishedTimeText: video.publishedTimeText?.simpleText,
                lengthText: video.lengthText?.simpleText,
                badges: video.badges ? video.badges.map(b => b.metadataBadgeRenderer.label) : [],
                trackingParams: video.trackingParams,
            });
        } else if (item.channelRenderer) {
            const channel = item.channelRenderer;
            results.channels.push({
                channelId: channel.channelId,
                channelName: channel.title.simpleText,
                avatar: channel.thumbnail.thumbnails,
                subscriberCount: channel.subscriberCountText?.simpleText,
                videoCountText: channel.videoCountText?.simpleText,
                descriptionSnippet: channel.descriptionSnippet?.runs.map(r => r.text).join(''),
                isVerified: channel.ownerBadges?.some(b => b.metadataBadgeRenderer.style === 'BADGE_STYLE_TYPE_VERIFIED'),
                navigationEndpoint: channel.navigationEndpoint,
                trackingParams: channel.trackingParams,
            });
        } else if (item.playlistRenderer) {
            const playlist = item.playlistRenderer;
            results.playlists.push({
                playlistId: playlist.playlistId,
                title: playlist.title.simpleText,
                videoCount: playlist.videoCount,
                firstVideoTitles: playlist.videos.map(v => v.childVideoRenderer.title.simpleText),
                channelName: playlist.longBylineText.runs[0].text,
                thumbnails: playlist.thumbnails,
                trackingParams: playlist.trackingParams,
            });
        }
    });

    return results;
}

module.exports = { processSearchData };
// processors/trendingProcessor.js

/**
 * Trích xuất danh sách video thịnh hành với dữ liệu chi tiết.
 * @param {object} rawData - Dữ liệu JSON thô.
 * @returns {Array} - Danh sách video thịnh hành chi tiết.
 */
function processTrendingData(rawData) {
    const contents = rawData.data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents;

    return contents.map(item => {
        const video = item.videoRenderer;
        if (!video) return null;

        return {
            videoId: video.videoId,
            title: video.title.runs.map(r => r.text).join(''),
            thumbnails: video.thumbnail.thumbnails,
            channelName: video.longBylineText.runs[0].text,
            channelId: video.longBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId,
            channelAvatar: video.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.thumbnail.thumbnails,
            viewCountText: video.viewCountText.simpleText,
            publishedTimeText: video.publishedTimeText.simpleText,
            lengthText: video.lengthText?.simpleText,
            descriptionSnippet: video.descriptionSnippet?.runs.map(r => r.text).join('') || null,
            badges: video.badges ? video.badges.map(b => b.metadataBadgeRenderer.label) : [],
            trackingParams: video.trackingParams,
        };
    }).filter(Boolean);
}

module.exports = { processTrendingData };