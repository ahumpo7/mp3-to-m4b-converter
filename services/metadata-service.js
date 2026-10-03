const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const mm = require('music-metadata');
const { ffprobePath } = require('../ffmpeg-finder');

/**
 * Format seconds to HH:MM:SS or HH:MM:SS.mmm
 */
function formatTime(seconds, includeMs = false) {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  const mmm = String(ms).padStart(3, '0');

  return includeMs ? `${hh}:${mm}:${ss}.${mmm}` : `${hh}:${mm}:${ss}`;
}

/**
 * Parse time string HH:MM:SS or MM:SS to seconds
 */
function parseTimeString(timeStr) {
  if (typeof timeStr === 'number') return timeStr;
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.some(isNaN)) return 0;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

/**
 * Run ffprobe to get JSON info
 */
function runFfprobe(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-show_chapters',
      filePath
    ];

    execFile(ffprobePath, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`ffprobe failed: ${err.message}`));
      }
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch (parseErr) {
        reject(new Error(`Failed to parse ffprobe JSON output: ${parseErr.message}`));
      }
    });
  });
}

/**
 * Extract all metadata, chapters, and cover art from an audio file
 */
async function extractMetadata(filePath, fileId = null, uploadsDir = null) {
  let probeData = null;
  let mmData = null;

  try {
    probeData = await runFfprobe(filePath);
  } catch (err) {
    console.warn('ffprobe error:', err.message);
  }

  try {
    mmData = await mm.parseFile(filePath, { duration: true, skipCovers: false });
  } catch (err) {
    console.warn('music-metadata error:', err.message);
  }

  const format = (probeData && probeData.format) || {};
  const tags = format.tags || {};
  const common = (mmData && mmData.common) || {};

  const duration = parseFloat(format.duration) || (mmData && mmData.format && mmData.format.duration) || 0;
  const bitrate = parseInt(format.bit_rate, 10) || (mmData && mmData.format && mmData.format.bitrate) || 128000;
  
  // Find audio stream specs
  let audioStream = null;
  if (probeData && probeData.streams) {
    audioStream = probeData.streams.find(s => s.codec_type === 'audio');
  }

  const sampleRate = audioStream ? parseInt(audioStream.sample_rate, 10) : (mmData && mmData.format && mmData.format.sampleRate) || 44100;
  const channels = audioStream ? audioStream.channels : (mmData && mmData.format && mmData.format.numberOfChannels) || 2;
  const channelLayout = audioStream ? audioStream.channel_layout : (channels === 1 ? 'mono' : 'stereo');

  // Extract cover picture
  let coverDataUrl = null;
  let coverFormat = null;
  let coverFilePath = null;

  if (common.picture && common.picture.length > 0) {
    const pic = common.picture[0];
    coverFormat = pic.format;
    const buf = Buffer.from(pic.data);
    coverDataUrl = `data:${pic.format};base64,${buf.toString('base64')}`;
    if (uploadsDir && fileId) {
      const ext = pic.format && pic.format.includes('png') ? '.png' : '.jpg';
      coverFilePath = path.join(uploadsDir, `${fileId}_cover${ext}`);
      try {
        fs.writeFileSync(coverFilePath, buf);
      } catch (err) {
        console.warn('Failed to write cover image to disk:', err.message);
      }
    }
  }

  // Fallback: If music-metadata did not extract picture, but ffprobe detected a video/cover stream
  if (!coverFilePath && uploadsDir && fileId && probeData && probeData.streams && probeData.streams.some(s => s.codec_type === 'video')) {
    try {
      const { execFileSync } = require('child_process');
      const { ffmpegPath } = require('../ffmpeg-finder');
      const fallbackCover = path.join(uploadsDir, `${fileId}_cover.jpg`);
      execFileSync(ffmpegPath, ['-i', filePath, '-an', '-vcodec', 'copy', fallbackCover, '-y'], { stdio: 'ignore' });
      if (fs.existsSync(fallbackCover) && fs.statSync(fallbackCover).size > 0) {
        coverFilePath = fallbackCover;
        const buf = fs.readFileSync(fallbackCover);
        coverDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
        coverFormat = 'image/jpeg';
      }
    } catch (e) {
      console.warn('Cover extraction fallback failed:', e.message);
    }
  }

  // Unified metadata fields
  const title = tags.title || tags.TIT2 || common.title || '';
  const artist = tags.artist || tags.TPE1 || common.artist || (common.artists && common.artists.join(', ')) || '';
  const album = tags.album || tags.TALB || common.album || '';
  const albumArtist = tags.album_artist || tags.TPE2 || common.albumartist || artist || '';
  const composer = tags.composer || tags.TCOM || common.composer || (common.composers && common.composers.join(', ')) || '';
  const year = tags.date || tags.year || tags.TDRC || tags.TYER || common.year || '';
  const genre = tags.genre || tags.TCON || (common.genre && common.genre.join(', ')) || 'Audiobook';
  const comment = tags.comment || tags.description || common.comment ? (Array.isArray(common.comment) ? common.comment.map(c => typeof c === 'string' ? c : c.text).join('\n') : common.comment) : '';
  const track = tags.track || (common.track && common.track.no ? `${common.track.no}${common.track.of ? '/' + common.track.of : ''}` : '');

  // Extract chapters
  let rawChapters = [];
  if (probeData && Array.isArray(probeData.chapters) && probeData.chapters.length > 0) {
    rawChapters = probeData.chapters;
  } else if (mmData && Array.isArray(mmData.format && mmData.format.chapters) && mmData.format.chapters.length > 0) {
    // If music-metadata found chapters
    rawChapters = mmData.format.chapters.map((ch, idx) => ({
      id: idx,
      start_time: (ch.start / 1000).toString(),
      end_time: (ch.end / 1000).toString(),
      tags: { title: ch.title || `Chapter ${idx + 1}` }
    }));
  }

  const chapters = rawChapters.map((ch, idx) => {
    const startSec = parseFloat(ch.start_time) || 0;
    const endSec = parseFloat(ch.end_time) || duration;
    const chTitle = (ch.tags && (ch.tags.title || ch.tags.TIT2)) || `Chapter ${idx + 1}`;
    return {
      id: idx + 1,
      start: Math.max(0, startSec),
      end: Math.min(duration, endSec),
      startTimeStr: formatTime(startSec),
      endTimeStr: formatTime(endSec),
      durationStr: formatTime(Math.max(0, endSec - startSec)),
      title: chTitle
    };
  });

  return {
    duration,
    durationFormatted: formatTime(duration),
    bitrate,
    sampleRate,
    channels,
    channelLayout,
    hasCover: !!coverDataUrl,
    coverDataUrl,
    coverFilePath,
    coverFormat,
    metadata: {
      title,
      artist,
      album,
      albumArtist,
      composer,
      year: year ? String(year) : '',
      genre,
      comment: typeof comment === 'string' ? comment : '',
      track
    },
    chapters
  };
}

module.exports = {
  extractMetadata,
  formatTime,
  parseTimeString,
  runFfprobe
};
