const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const { ffmpegPath } = require('../ffmpeg-finder');
const { parseTimeString } = require('./metadata-service');

/**
 * Escapes characters for FFMETADATA format
 * Required escapes: =, ;, #, \, and newlines
 */
function escapeFFMetadata(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/=/g, '\\=')
    .replace(/;/g, '\\;')
    .replace(/#/g, '\\#')
    .replace(/\r?\n/g, '\\\n');
}

/**
 * Generates FFMETADATA file content
 */
function generateFFMetadata({ metadata = {}, chapters = [], totalDuration = 0 }) {
  let content = ';FFMETADATA1\n';

  // Global metadata mapping
  if (metadata.title) content += `title=${escapeFFMetadata(metadata.title)}\n`;
  if (metadata.artist) content += `artist=${escapeFFMetadata(metadata.artist)}\n`;
  if (metadata.album) content += `album=${escapeFFMetadata(metadata.album)}\n`;
  if (metadata.albumArtist || metadata.artist) content += `album_artist=${escapeFFMetadata(metadata.albumArtist || metadata.artist)}\n`;
  if (metadata.composer) content += `composer=${escapeFFMetadata(metadata.composer)}\n`;
  if (metadata.year) content += `date=${escapeFFMetadata(metadata.year)}\n`;
  if (metadata.genre) content += `genre=${escapeFFMetadata(metadata.genre)}\n`;
  if (metadata.comment) content += `comment=${escapeFFMetadata(metadata.comment)}\n`;
  if (metadata.track) content += `track=${escapeFFMetadata(metadata.track)}\n`;

  // Chapters
  if (Array.isArray(chapters) && chapters.length > 0) {
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      let startSec = typeof ch.start === 'number' ? ch.start : parseTimeString(ch.start);
      let endSec = typeof ch.end === 'number' ? ch.end : parseTimeString(ch.end);

      if (startSec < 0) startSec = 0;
      if (endSec <= startSec) {
        if (i < chapters.length - 1) {
          const nextStart = typeof chapters[i + 1].start === 'number' ? chapters[i + 1].start : parseTimeString(chapters[i + 1].start);
          endSec = nextStart > startSec ? nextStart : startSec + 1;
        } else {
          endSec = totalDuration > startSec ? totalDuration : startSec + 1;
        }
      }

      const startMs = Math.round(startSec * 1000);
      const endMs = Math.round(endSec * 1000);
      const title = ch.title || `Chapter ${i + 1}`;

      content += '\n[CHAPTER]\n';
      content += 'TIMEBASE=1/1000\n';
      content += `START=${startMs}\n`;
      content += `END=${endMs}\n`;
      content += `title=${escapeFFMetadata(title)}\n`;
    }
  }

  return content;
}

/**
 * Run FFmpeg conversion with progress reporting
 */
function convertToM4b({
  inputFilePath,
  outputFilePath,
  metadata = {},
  chapters = [],
  totalDuration = 0,
  newCoverPath = null,
  keepOriginalCover = true,
  audioOptions = {}
}) {
  const emitter = new EventEmitter();

  // 1. Create temp metadata file
  const metaDir = path.dirname(outputFilePath);
  const metaFilePath = path.join(metaDir, `meta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.txt`);
  const metaContent = generateFFMetadata({ metadata, chapters, totalDuration });
  fs.writeFileSync(metaFilePath, metaContent, 'utf8');

  // 2. Build FFmpeg command arguments
  const args = [];

  // Input #0: audio
  args.push('-i', inputFilePath);

  let metaInputIndex = 1;
  let coverInputIndex = -1;

  // New cover image
  if (newCoverPath && fs.existsSync(newCoverPath)) {
    args.push('-i', newCoverPath);
    coverInputIndex = 1;
    metaInputIndex = 2;
  }

  // Metadata input
  args.push('-i', metaFilePath);

  // Audio stream mapping
  args.push('-map', '0:a');

  // Video / Cover art stream mapping
  if (newCoverPath && fs.existsSync(newCoverPath)) {
    // Map newly uploaded cover image
    args.push('-map', `${coverInputIndex}:v`);
    args.push('-c:v', 'copy');
    args.push('-disposition:v:0', 'attached_pic');
  } else if (keepOriginalCover) {
    // Try to map original cover if present in input
    args.push('-map', '0:v?');
    args.push('-c:v', 'copy');
    args.push('-disposition:v:0', 'attached_pic');
  }

  // Copy metadata from FFMETADATA file
  args.push('-map_metadata', String(metaInputIndex));

  // Audio encoding settings
  args.push('-c:a', 'aac');

  const bitrate = audioOptions.bitrate || '128k';
  args.push('-b:a', bitrate);

  if (audioOptions.channels && audioOptions.channels !== 'auto') {
    args.push('-ac', String(audioOptions.channels));
  }

  if (audioOptions.sampleRate && audioOptions.sampleRate !== 'auto') {
    args.push('-ar', String(audioOptions.sampleRate));
  }

  // Optimize for streaming / fast start & Apple Books compatibility
  args.push('-movflags', '+faststart');

  // Overwrite output
  args.push('-y', outputFilePath);

  console.log('Spawning FFmpeg with args:', args.join(' '));

  const ffmpegProcess = spawn(ffmpegPath, args);
  emitter.process = ffmpegProcess;

  let stderrBuffer = '';

  ffmpegProcess.stderr.on('data', (data) => {
    const chunk = data.toString();
    stderrBuffer += chunk;

    // Parse progress info: time=00:01:23.45 bitrate= 128.0kbits/s speed=45.2x
    const timeMatch = chunk.match(/time=(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);
    const speedMatch = chunk.match(/speed=\s*([\d\.]+)x/);
    const bitrateMatch = chunk.match(/bitrate=\s*([\d\.]+\s*\w+\/s)/);

    if (timeMatch) {
      const currentTimeSec = parseTimeString(timeMatch[1]);
      let percent = 0;
      if (totalDuration > 0) {
        percent = Math.min(100, Math.round((currentTimeSec / totalDuration) * 100));
      }

      emitter.emit('progress', {
        percent,
        currentTime: currentTimeSec,
        currentTimeStr: timeMatch[1],
        totalDuration,
        speed: speedMatch ? `${speedMatch[1]}x` : '',
        bitrate: bitrateMatch ? bitrateMatch[1] : ''
      });
    }
  });

  ffmpegProcess.on('error', (err) => {
    cleanupMeta();
    emitter.emit('error', err);
  });

  ffmpegProcess.on('close', (code) => {
    cleanupMeta();
    if (code === 0) {
      emitter.emit('progress', {
        percent: 100,
        currentTime: totalDuration,
        totalDuration,
        speed: '',
        bitrate: ''
      });
      emitter.emit('complete', { outputFilePath });
    } else {
      const err = new Error(`FFmpeg exited with error code ${code}.\n${stderrBuffer.slice(-800)}`);
      emitter.emit('error', err);
    }
  });

  function cleanupMeta() {
    try {
      if (fs.existsSync(metaFilePath)) fs.unlinkSync(metaFilePath);
    } catch (e) {}
  }

  emitter.cancel = () => {
    try {
      ffmpegProcess.kill('SIGKILL');
      cleanupMeta();
    } catch (e) {}
  };

  return emitter;
}

module.exports = {
  convertToM4b,
  generateFFMetadata,
  escapeFFMetadata
};
