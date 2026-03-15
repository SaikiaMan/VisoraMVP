const RE_YOUTUBE =
  /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)';

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const ANDROID_VERSION = '20.10.38';
const ANDROID_USER_AGENT = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14)`;
const ANDROID_CONTEXT = {
  client: { clientName: 'ANDROID', clientVersion: ANDROID_VERSION },
};

const RE_XML_TRANSCRIPT =
  /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

class YoutubeTranscriptError extends Error {
  constructor(message) {
    super(`[YoutubeTranscript] ${message}`);
  }
}

class YoutubeTranscript {
  static async fetchTranscript(videoId, config = {}) {
    const identifier = YoutubeTranscript.retrieveVideoId(videoId);

    // Try innertube API first (more reliable)
    const innertubeResult = await this.fetchViaInnerTube(identifier, config);
    if (innertubeResult && innertubeResult.length > 0) {
      return innertubeResult;
    }

    // Fallback to web page scraping
    return this.fetchViaWebPage(identifier, config);
  }

  static async fetchViaInnerTube(videoId, config) {
    try {
      const resp = await fetch(INNERTUBE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': ANDROID_USER_AGENT,
        },
        body: JSON.stringify({
          context: ANDROID_CONTEXT,
          videoId,
        }),
      });

      if (!resp.ok) return null;

      const data = await resp.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!Array.isArray(tracks) || tracks.length === 0) return null;

      return this.fetchTranscriptFromTracks(tracks, videoId, config);
    } catch {
      return null;
    }
  }

  static async fetchViaWebPage(videoId, config) {
    const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        ...(config.lang && { 'Accept-Language': config.lang }),
        'User-Agent': USER_AGENT,
      },
    });
    const body = await resp.text();

    // Try parsing ytInitialPlayerResponse
    const match = body.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    let tracks;
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        tracks = parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      } catch {}
    }

    // Fallback: parse from "captions": in page
    if (!tracks) {
      const split = body.split('"captions":');
      if (split.length > 1) {
        try {
          const captions = JSON.parse(
            split[1].split(',"videoDetails')[0].replace('\n', '')
          );
          tracks = captions?.playerCaptionsTracklistRenderer?.captionTracks;
        } catch {}
      }
    }

    if (!Array.isArray(tracks) || tracks.length === 0) {
      throw new YoutubeTranscriptError(`No transcripts available for video (${videoId})`);
    }

    return this.fetchTranscriptFromTracks(tracks, videoId, config);
  }

  static async fetchTranscriptFromTracks(tracks, videoId, config) {
    const track = config.lang
      ? tracks.find((t) => t.languageCode === config.lang)
      : tracks[0];

    if (!track) {
      throw new YoutubeTranscriptError(
        `No transcript in language "${config.lang}" for video (${videoId})`
      );
    }

    const resp = await fetch(track.baseUrl, {
      headers: {
        ...(config.lang && { 'Accept-Language': config.lang }),
        'User-Agent': USER_AGENT,
      },
    });

    if (!resp.ok) {
      throw new YoutubeTranscriptError(`Failed to fetch transcript for video (${videoId})`);
    }

    const xml = await resp.text();
    const lang = config.lang ?? tracks[0].languageCode;

    return this.parseTranscriptXml(xml, lang);
  }

  static parseTranscriptXml(xml, lang) {
    // Try new format: <p t="ms" d="ms">...<s>text</s>...</p>
    const newFormatRe = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    const results = [];
    let match;

    while ((match = newFormatRe.exec(xml)) !== null) {
      const offset = parseInt(match[1], 10);
      const duration = parseInt(match[2], 10);
      const inner = match[3];

      // Extract text from <s> tags, or strip all tags
      let text = '';
      const sRe = /<s[^>]*>([^<]*)<\/s>/g;
      let sMatch;
      while ((sMatch = sRe.exec(inner)) !== null) {
        text += sMatch[1];
      }
      if (!text) {
        text = inner.replace(/<[^>]+>/g, '');
      }
      text = this.decodeEntities(text).trim();
      if (text) {
        results.push({ text, duration, offset, lang });
      }
    }

    if (results.length > 0) return results;

    // Fallback: old format <text start="s" dur="s">text</text>
    return [...xml.matchAll(RE_XML_TRANSCRIPT)].map((r) => ({
      text: this.decodeEntities(r[3]),
      duration: parseFloat(r[2]),
      offset: parseFloat(r[1]),
      lang,
    }));
  }

  static decodeEntities(text) {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  }

  static retrieveVideoId(videoId) {
    if (videoId.length === 11) {
      return videoId;
    }
    const matchId = videoId.match(RE_YOUTUBE);
    if (matchId && matchId.length) {
      return matchId[1];
    }
    throw new YoutubeTranscriptError('Could not extract YouTube video ID.');
  }
}

export { YoutubeTranscript };
