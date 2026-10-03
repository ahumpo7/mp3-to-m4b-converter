const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ffprobePath } = require('./ffmpeg-finder');

async function runTest() {
  console.log('--- Starting End-to-End Test ---');

  const testDir = path.join(__dirname, 'test_sandbox');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const inputMp3 = path.join(testDir, 'sample_audiobook.mp3');
  const coverJpg = path.join(testDir, 'cover.jpg');
  const metaTxt = path.join(testDir, 'meta.txt');
  const downloadedM4b = path.join(testDir, 'downloaded.m4b');

  // 1. Generate test cover image
  console.log('1. Generating test cover art...');
  execSync(`ffmpeg -f lavfi -i "color=c=purple:s=200x200:d=1" -vframes 1 "${coverJpg}" -y`, { stdio: 'ignore' });

  // 2. Generate metadata with chapters
  console.log('2. Generating metadata & chapters...');
  const metaContent = `;FFMETADATA1
title=The Chronicles of Antigravity
artist=DeepMind Engineering
album=AI Legends Series
composer=Antigravity Model
date=2026
genre=Audiobook
comment=A thrilling adventure into agentic AI.

[CHAPTER]
TIMEBASE=1/1000
START=0
END=4000
title=Chapter 1: The Spark

[CHAPTER]
TIMEBASE=1/1000
START=4000
END=8000
title=Chapter 2: The Agent Awakens

[CHAPTER]
TIMEBASE=1/1000
START=8000
END=12000
title=Chapter 3: The Conversion
`;
  fs.writeFileSync(metaTxt, metaContent, 'utf8');

  // 3. Generate tagged MP3
  console.log('3. Synthesizing audio & embedding ID3v2 tags/chapters/cover...');
  execSync(`ffmpeg -f lavfi -i "sine=frequency=520:duration=12" -i "${coverJpg}" -i "${metaTxt}" -map 0:a -map 1:v -map_metadata 2 -c:a libmp3lame -b:a 64k -c:v copy -metadata:s:v title="Cover" "${inputMp3}" -y`, { stdio: 'ignore' });

  // 4. Test /api/analyze
  console.log('4. Uploading to /api/analyze...');
  const fileBuffer = fs.readFileSync(inputMp3);
  const blob = new Blob([fileBuffer], { type: 'audio/mpeg' });
  const formData = new FormData();
  formData.append('audio', blob, 'sample_audiobook.mp3');

  const analyzeRes = await fetch('http://localhost:3000/api/analyze', {
    method: 'POST',
    body: formData
  });

  if (!analyzeRes.ok) {
    throw new Error(`Analyze request failed with status: ${analyzeRes.status}`);
  }

  const analyzeData = await analyzeRes.json();
  console.log('Analyze Response:');
  console.log('  File ID:', analyzeData.fileId);
  console.log('  Detected Title:', analyzeData.metadata.title);
  console.log('  Detected Author:', analyzeData.metadata.artist);
  console.log('  Detected Chapters Count:', analyzeData.chapters.length);
  console.log('  Detected Cover Art:', analyzeData.hasCover);

  if (analyzeData.chapters.length !== 3) {
    throw new Error(`Expected 3 chapters, got ${analyzeData.chapters.length}`);
  }
  if (!analyzeData.hasCover) {
    throw new Error('Expected cover art to be detected');
  }

  // 5. Test /api/convert
  console.log('5. Triggering conversion via /api/convert...');
  const convertFormData = new FormData();
  convertFormData.append('fileId', analyzeData.fileId);
  convertFormData.append('metadata', JSON.stringify(analyzeData.metadata));
  convertFormData.append('chapters', JSON.stringify(analyzeData.chapters));
  convertFormData.append('audioOptions', JSON.stringify({ bitrate: '96k', channels: 'auto', sampleRate: 'auto' }));
  convertFormData.append('keepCover', 'true');

  const convertRes = await fetch('http://localhost:3000/api/convert', {
    method: 'POST',
    body: convertFormData
  });

  const convertData = await convertRes.json();
  console.log('Convert Response:', convertData);
  const jobId = convertData.jobId;

  // 6. Poll / listen to progress
  console.log('6. Tracking conversion progress...');
  let completed = false;
  let attempts = 0;

  while (!completed && attempts < 40) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;

    // Check status by downloading or polling
    const dlRes = await fetch(`http://localhost:3000/api/download/${jobId}`);
    if (dlRes.status === 200) {
      completed = true;
      const m4bBuffer = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(downloadedM4b, m4bBuffer);
      console.log(`Conversion finished! Downloaded M4B (${m4bBuffer.length} bytes).`);
      break;
    }
  }

  if (!completed) {
    throw new Error('Conversion did not complete in expected time.');
  }

  // 7. Verify the converted M4B with ffprobe
  console.log('7. Verifying M4B chapters and metadata with ffprobe...');
  const probeOutput = execSync(`"${ffprobePath}" -v quiet -print_format json -show_chapters -show_format -show_streams "${downloadedM4b}"`, { encoding: 'utf8' });
  const result = JSON.parse(probeOutput);

  console.log('\n--- VERIFICATION REPORT ---');
  console.log('Container format:', result.format.format_name);
  console.log('Major Brand:', result.format.tags.major_brand);
  console.log('Title Tag:', result.format.tags.title);
  console.log('Artist Tag:', result.format.tags.artist);
  console.log('Album Tag:', result.format.tags.album);
  console.log('Composer Tag:', result.format.tags.composer);
  console.log('Genre Tag:', result.format.tags.genre);

  console.log('\nStreams:');
  result.streams.forEach((s, idx) => {
    console.log(`  Stream #${idx}: ${s.codec_type} (${s.codec_name}) - Disposition attached_pic: ${s.disposition.attached_pic}`);
  });

  console.log('\nChapters:');
  result.chapters.forEach((ch, idx) => {
    console.log(`  Chapter #${idx + 1}: ${ch.tags ? ch.tags.title : 'No title'} [${ch.start_time}s -> ${ch.end_time}s]`);
  });

  // Assertions
  const hasAudioStream = result.streams.some(s => s.codec_name === 'aac');
  const hasChapterTrack = result.streams.some(s => s.codec_type === 'data' || s.codec_name === 'bin_data');
  const hasCoverStream = result.streams.some(s => s.disposition.attached_pic === 1);
  const chapterTitles = result.chapters.map(c => c.tags && c.tags.title);

  if (!hasAudioStream) throw new Error('AAC Audio stream missing in M4B');
  if (!hasCoverStream) throw new Error('Cover art stream missing in M4B');
  if (result.chapters.length !== 3) throw new Error(`Expected 3 chapters, found ${result.chapters.length}`);
  if (!chapterTitles.includes('Chapter 1: The Spark')) throw new Error('Chapter 1 title missing');
  if (!chapterTitles.includes('Chapter 2: The Agent Awakens')) throw new Error('Chapter 2 title missing');
  if (!chapterTitles.includes('Chapter 3: The Conversion')) throw new Error('Chapter 3 title missing');

  console.log('\n✅ ALL VERIFICATION CHECKS PASSED PERFECTLY!');

  // Cleanup test sandbox
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {}
}

runTest().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
