const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findBinary(binName) {
  const exeName = process.platform === 'win32' ? `${binName}.exe` : binName;

  // 1. Try which / where
  try {
    const cmd = process.platform === 'win32' ? `where ${exeName}` : `which ${binName}`;
    const stdout = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8' });
    const firstLine = stdout.split(/\r?\n/)[0].trim();
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine;
    }
  } catch (e) {
    // not in current process PATH
  }

  // 2. On Windows, check user/system PATH from registry/environment
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

    // Check WinGet Packages
    const wingetPkgs = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetPkgs)) {
      try {
        const dirs = fs.readdirSync(wingetPkgs);
        for (const dir of dirs) {
          if (dir.toLowerCase().includes('ffmpeg')) {
            const candidateDir = path.join(wingetPkgs, dir);
            // search recursively up to 3 levels
            const found = searchDirForFile(candidateDir, exeName, 3);
            if (found) return found;
          }
        }
      } catch (err) {}
    }

    // Common Windows install paths
    const commonPaths = [
      path.join(localAppData, 'Programs', 'ffmpeg', 'bin', exeName),
      path.join(programFiles, 'ffmpeg', 'bin', exeName),
      path.join(userProfile, 'ffmpeg', 'bin', exeName),
      path.join('C:\\ffmpeg', 'bin', exeName)
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) return p;
    }
  }

  return binName; // fallback to plain binary name
}

function searchDirForFile(dir, fileName, depth = 3) {
  if (depth <= 0) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
        return fullPath;
      } else if (entry.isDirectory()) {
        const found = searchDirForFile(fullPath, fileName, depth - 1);
        if (found) return found;
      }
    }
  } catch (e) {}
  return null;
}

const ffmpegPath = findBinary('ffmpeg');
const ffprobePath = findBinary('ffprobe');

console.log('Detected FFmpeg:', ffmpegPath);
console.log('Detected FFprobe:', ffprobePath);

// Ensure directory is in PATH
const ffmpegDir = path.dirname(ffmpegPath);
if (!process.env.PATH.includes(ffmpegDir)) {
  process.env.PATH = `${ffmpegDir};${process.env.PATH}`;
}

module.exports = { ffmpegPath, ffprobePath };
