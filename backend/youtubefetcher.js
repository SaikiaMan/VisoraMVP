const RE_YOUTUBE =
  /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const ANDROID_VERSION = '20.10.38';
const ANDROID_USER_AGENT = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14)`;

const INNERTUBE_CLIENTS = [
  {
    name: 'ANDROID',
    userAgent: ANDROID_USER_AGENT,
    context: { client: { clientName: 'ANDROID', clientVersion: ANDROID_VERSION, androidSdkVersion: 34 } },
  },
  {
    name: 'IOS',
    userAgent: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1 like Mac OS X; en_US)',
    context: { client: { clientName: 'IOS', clientVersion: '19.45.4', deviceModel: 'iPhone16,2', osVersion: '18.1.0' } },
  },
  {
    name: 'WEB',
    userAgent: USER_AGENT,
    context: { client: { clientName: 'WEB', clientVersion: '2.20240315.01.00' } },
  },
];

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

    // Try Innertube API clients first (most reliable)
    for (const clientConfig of INNERTUBE_CLIENTS) {
      const innertubeResult = await this.fetchViaInnerTubeClient(identifier, clientConfig, config);
      if (Array.isArray(innertubeResult) && innertubeResult.length > 0) {
        return innertubeResult;
      }
    }

    // Fallback to web page scraping
    return this.fetchViaWebPage(identifier, config);
  }

  static async fetchViaInnerTubeClient(videoId, clientConfig, config) {
    try {
      const resp = await fetch(INNERTUBE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': clientConfig.userAgent,
        },
        body: JSON.stringify({
          context: clientConfig.context,
          videoId,
        }),
      });

      if (!resp.ok) return null;

      const data = await resp.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!Array.isArray(tracks) || tracks.length === 0) return null;

      return await this.fetchTranscriptFromTracks(tracks, videoId, config);
    } catch {
      return null;
    }
  }

  static selectBestTrack(tracks, preferredLang) {
    if (!Array.isArray(tracks) || tracks.length === 0) return null;

    if (preferredLang) {
      const exactMatch = tracks.find(
        (t) => t.languageCode?.toLowerCase() === preferredLang.toLowerCase()
      );
      if (exactMatch) return exactMatch;

      const prefixMatch = tracks.find(
        (t) => t.languageCode?.toLowerCase().startsWith(preferredLang.toLowerCase())
      );
      if (prefixMatch) return prefixMatch;
    }

    // 1. Prefer English manual captions
    const enManual = tracks.find(
      (t) =>
        (t.languageCode === 'en' || t.languageCode?.startsWith('en-')) &&
        t.kind !== 'asr'
    );
    if (enManual) return enManual;

    // 2. Prefer English auto-generated captions
    const enAuto = tracks.find(
      (t) => t.languageCode === 'en' || t.languageCode?.startsWith('en-')
    );
    if (enAuto) return enAuto;

    // 3. Prefer any manual captions
    const manualTrack = tracks.find((t) => t.kind !== 'asr');
    if (manualTrack) return manualTrack;

    // 4. Prefer default track
    const defaultTrack = tracks.find((t) => t.isDefault);
    if (defaultTrack) return defaultTrack;

    // 5. Fallback to first available track
    return tracks[0];
  }

  static async fetchViaWebPage(videoId, config) {
    let body = '';
    try {
      const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          ...(config.lang && { 'Accept-Language': config.lang }),
          'User-Agent': USER_AGENT,
        },
      });
      if (resp.ok) {
        body = await resp.text();
      }
    } catch {
      // Ignored
    }

    let tracks = null;

    if (body) {
      // Try parsing ytInitialPlayerResponse
      const match = body.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
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
    }

    if (!Array.isArray(tracks) || tracks.length === 0) {
      throw new YoutubeTranscriptError(
        `No captions or transcripts are available for video (${videoId}). Please try a video with English captions enabled.`
      );
    }

    return this.fetchTranscriptFromTracks(tracks, videoId, config);
  }

  static async fetchTranscriptFromTracks(tracks, videoId, config) {
    const track = this.selectBestTrack(tracks, config.lang || 'en');

    if (!track || !track.baseUrl) {
      throw new YoutubeTranscriptError(
        `No suitable transcript track found for video (${videoId}).`
      );
    }

    // Try fetching baseUrl with Android User-Agent first, then Standard User-Agent
    let xml = '';
    const headersList = [
      { 'User-Agent': ANDROID_USER_AGENT },
      { 'User-Agent': USER_AGENT, ...(config.lang && { 'Accept-Language': config.lang }) },
      {},
    ];

    for (const headers of headersList) {
      try {
        const resp = await fetch(track.baseUrl, { headers });
        if (resp.ok) {
          xml = await resp.text();
          if (xml && xml.trim().length > 0) {
            break;
          }
        }
      } catch {
        // Retry with next header set
      }
    }

    if (!xml || xml.trim().length === 0) {
      throw new YoutubeTranscriptError(
        `Failed to download transcript data for video (${videoId}).`
      );
    }

    const lang = track.languageCode || config.lang || 'en';
    const parsed = this.parseTranscriptXml(xml, lang);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new YoutubeTranscriptError(
        `Transcript content was empty or unparseable for video (${videoId}).`
      );
    }

    return parsed;
  }

  static parseTranscriptXml(xml, lang) {
    // Try format 3: <p t="ms" d="ms">...<s>text</s>...</p>
    const newFormatRe = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    const results = [];
    let match;

    while ((match = newFormatRe.exec(xml)) !== null) {
      const offset = parseInt(match[1], 10);
      const duration = parseInt(match[2], 10);
      const inner = match[3];

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

    // Fallback: format 1/2 <text start="s" dur="s">text</text>
    // Note: start and dur in format 1/2 are in seconds, so convert to milliseconds
    return [...xml.matchAll(RE_XML_TRANSCRIPT)].map((r) => {
      const secStart = parseFloat(r[1]) || 0;
      const secDur = parseFloat(r[2]) || 0;
      return {
        text: this.decodeEntities(r[3]).trim(),
        duration: Math.round(secDur * 1000),
        offset: Math.round(secStart * 1000),
        lang,
      };
    }).filter((item) => item.text.length > 0);
  }

  static decodeEntities(text) {
    return String(text || '')
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
    if (typeof videoId !== 'string') {
      throw new YoutubeTranscriptError('Invalid YouTube video input.');
    }
    const trimmed = videoId.trim();
    if (trimmed.length === 11 && !trimmed.includes('/') && !trimmed.includes('?')) {
      return trimmed;
    }
    const matchId = trimmed.match(RE_YOUTUBE);
    if (matchId && matchId[1]) {
      return matchId[1];
    }
    throw new YoutubeTranscriptError('Could not extract a valid YouTube video ID from the provided URL.');
  }
}

export { YoutubeTranscript };
