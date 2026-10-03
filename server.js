const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('crypto'); // We can use crypto.randomUUID()
const crypto = require('crypto');

const { ffmpegPath, ffprobePath } = require('./ffmpeg-finder');
const { extractMetadata, formatTime } = require('./services/metadata-service');
const { convertToM4b } = require('./services/converter-service');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON body parser
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Ensure temp directories exist
const UPLOADS_DIR = path.join(__dirname, 'temp', 'uploads');
const OUTPUTS_DIR = path.join(__dirname, 'temp', 'outputs');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// Configure Multer for disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const uniqueId = crypto.randomBytes(8).toString('hex');
    cb(null, `${uniqueId}_${safeName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024 // 2GB max file size
  }
});

// In-memory store for active jobs and analyzed files
const uploadedFiles = new Map();
const activeJobs = new Map();

/**
 * Clean up old temp files (older than 2 hours)
 */
function cleanupOldFiles() {
  const maxAgeMs = 2 * 60 * 60 * 1000;
  const now = Date.now();

  [UPLOADS_DIR, OUTPUTS_DIR].forEach((dir) => {
    try {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const filePath = path.join(dir, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath);
            console.log(`Cleaned up expired file: ${file}`);
          }
        } catch (e) {}
      });
    } catch (e) {}
  });
}
setInterval(cleanupOldFiles, 30 * 60 * 1000); // Check every 30 minutes

/**
 * Health & system status
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    ffmpeg: ffmpegPath,
    ffprobe: ffprobePath
  });
});

/**
 * Upload and analyze an MP3 file
 */
app.post('/api/analyze', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded.' });
    }

    const filePath = req.file.path;
    const fileId = path.basename(filePath);

    console.log(`Analyzing uploaded file: ${req.file.originalname} (${filePath})`);

    const analysis = await extractMetadata(filePath, fileId, UPLOADS_DIR);

    // Save info in cache
    uploadedFiles.set(fileId, {
      fileId,
      filePath,
      originalName: req.file.originalname,
      size: req.file.size,
      analysis,
      uploadTime: Date.now()
    });

    res.json({
      success: true,
      fileId,
      originalName: req.file.originalname,
      size: req.file.size,
      ...analysis
    });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: `Failed to analyze audio file: ${err.message}` });
  }
});

/**
 * Start conversion to M4B
 */
app.post('/api/convert', upload.single('newCover'), async (req, res) => {
  try {
    const { fileId, metadata: metaRaw, chapters: chRaw, audioOptions: optRaw, keepCover } = req.body;

    if (!fileId || !uploadedFiles.has(fileId)) {
      return res.status(400).json({ error: 'Invalid or missing fileId. Please re-upload your file.' });
    }

    const fileInfo = uploadedFiles.get(fileId);
    const inputFilePath = fileInfo.filePath;

    // Parse options
    const metadata = typeof metaRaw === 'string' ? JSON.parse(metaRaw || '{}') : (metaRaw || {});
    const chapters = typeof chRaw === 'string' ? JSON.parse(chRaw || '[]') : (chRaw || []);
    const audioOptions = typeof optRaw === 'string' ? JSON.parse(optRaw || '{}') : (optRaw || {});
    const keepOriginalCover = keepCover === 'true' || keepCover === true;
    const newCoverPath = req.file ? req.file.path : null;

    const jobId = crypto.randomBytes(8).toString('hex');
    const safeTitle = (metadata.title || path.basename(fileInfo.originalName, path.extname(fileInfo.originalName)))
      .replace(/[^a-zA-Z0-9_\-\.\s]/g, '_')
      .trim();

    const outputFileName = `${safeTitle}.m4b`;
    const outputFilePath = path.join(OUTPUTS_DIR, `${jobId}_${outputFileName}`);

    // Create job entry
    const job = {
      jobId,
      fileId,
      inputFilePath,
      outputFilePath,
      outputFileName,
      metadata,
      chapters,
      status: 'pending',
      percent: 0,
      speed: '',
      bitrate: '',
      currentTime: 0,
      totalDuration: fileInfo.analysis.duration || 0,
      clients: new Set(),
      error: null,
      downloadReady: false
    };

    activeJobs.set(jobId, job);

    console.log(`Starting conversion job: ${jobId} -> ${outputFileName}`);

    // Start FFmpeg conversion
    const converter = convertToM4b({
      inputFilePath,
      outputFilePath,
      metadata,
      chapters,
      totalDuration: fileInfo.analysis.duration || 0,
      newCoverPath,
      originalCoverPath: fileInfo.analysis ? fileInfo.analysis.coverFilePath : null,
      keepOriginalCover,
      audioOptions
    });

    job.converter = converter;
    job.status = 'processing';

    converter.on('progress', (data) => {
      job.percent = data.percent;
      job.currentTime = data.currentTime;
      job.currentTimeStr = data.currentTimeStr;
      job.speed = data.speed;
      job.bitrate = data.bitrate;

      // Broadcast to SSE clients
      broadcastJob(job, {
        type: 'progress',
        percent: data.percent,
        currentTime: data.currentTime,
        currentTimeStr: data.currentTimeStr,
        totalDuration: job.totalDuration,
        speed: data.speed,
        bitrate: data.bitrate
      });
    });

    converter.on('complete', () => {
      job.status = 'completed';
      job.percent = 100;
      job.downloadReady = true;

      let finalSize = 0;
      try {
        finalSize = fs.statSync(outputFilePath).size;
      } catch (e) {}

      broadcastJob(job, {
        type: 'complete',
        jobId,
        fileName: outputFileName,
        fileSize: finalSize,
        duration: job.totalDuration,
        downloadUrl: `/api/download/${jobId}`,
        streamUrl: `/api/stream/${jobId}`
      });
      console.log(`Job ${jobId} completed successfully!`);
    });

    converter.on('error', (err) => {
      job.status = 'error';
      job.error = err.message;
      console.error(`Job ${jobId} failed:`, err.message);

      broadcastJob(job, {
        type: 'error',
        message: err.message
      });
    });

    res.json({
      success: true,
      jobId,
      outputFileName
    });
  } catch (err) {
    console.error('Convert endpoint error:', err);
    res.status(500).json({ error: `Conversion initialization failed: ${err.message}` });
  }
});

function broadcastJob(job, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const clientRes of job.clients) {
    try {
      clientRes.write(payload);
    } catch (e) {
      job.clients.delete(clientRes);
    }
  }
}

/**
 * Server-Sent Events (SSE) for real-time conversion progress
 */
app.get('/api/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  job.clients.add(res);

  // Send current state immediately
  res.write(`data: ${JSON.stringify({
    type: job.status,
    percent: job.percent,
    speed: job.speed,
    currentTime: job.currentTime,
    currentTimeStr: job.currentTimeStr,
    totalDuration: job.totalDuration,
    downloadUrl: job.downloadReady ? `/api/download/${jobId}` : undefined,
    streamUrl: job.downloadReady ? `/api/stream/${jobId}` : undefined,
    fileName: job.outputFileName
  })}\n\n`);

  req.on('close', () => {
    job.clients.delete(res);
  });
});

/**
 * Download converted M4B file
 */
app.get('/api/download/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (!job || !fs.existsSync(job.outputFilePath)) {
    return res.status(404).send('File not found or expired.');
  }

  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(job.outputFileName)}"`);

  const fileStream = fs.createReadStream(job.outputFilePath);
  fileStream.pipe(res);
});

/**
 * Stream M4B file for in-browser playback with Range header support
 */
app.get('/api/stream/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (!job || !fs.existsSync(job.outputFilePath)) {
    return res.status(404).send('Audio not found.');
  }

  const filePath = job.outputFilePath;
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'audio/mp4'
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mp4'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

/**
 * Cancel a conversion job
 */
app.post('/api/cancel/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeJobs.get(jobId);

  if (job) {
    if (job.converter && job.converter.cancel) {
      job.converter.cancel();
    }
    job.status = 'cancelled';
    broadcastJob(job, { type: 'cancelled', message: 'Conversion cancelled by user.' });
    activeJobs.delete(jobId);
    return res.json({ success: true, message: 'Job cancelled' });
  }

  res.status(404).json({ error: 'Job not found' });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🎧 MP3 to M4B Audiobook Converter Server Running!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`⚡ FFmpeg Path: ${ffmpegPath}`);
  console.log(`====================================================`);
});
