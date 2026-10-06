const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Task 3.3: Sanitize filenames
 * Strip separators/control characters, block Windows reserved names, prevent traversal.
 */
function sanitizeFilename(name) {
  if (typeof name !== 'string') return 'unnamed';
  
  // 1. Strip path separators and null bytes
  let clean = name.replace(/[\/\\]/g, '_').replace(/\0/g, '');
  
  // 2. Remove control characters and illegal Windows characters
  clean = clean.replace(/[\x00-\x1F\x7F"*:<>?|]/g, '_');
  
  // 3. Trim trailing spaces and dots (Windows doesn't like them)
  clean = clean.replace(/[\s.]+$/, '');
  
  // 4. Block Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
  if (reservedNames.test(clean)) {
    clean = '_' + clean;
  }
  
  // 5. If it became empty or is just dots, give a fallback
  if (!clean || clean === '.' || clean === '..') {
    clean = 'unnamed';
  }
  
  // Prevent traversal is naturally handled since we stripped / and \
  return clean;
}

/**
 * Task 3.6: Atomic File Writes
 * Write to a temporary file, then rename.
 */
function atomicWriteFileSync(filePath, data) {
  const tmpPath = filePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  try {
    fs.writeFileSync(tmpPath, data);
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch (e) {}
    }
    throw err;
  }
}

/**
 * Task 3.4: Safe imports (limit sizes)
 * Read and parse JSON with a max size limit to prevent OOM
 */
function safeLoadJsonSync(filePath, maxSize = 10 * 1024 * 1024) {
  if (!fs.existsSync(filePath)) return null;
  const stats = fs.statSync(filePath);
  if (stats.size > maxSize) {
    throw new Error(`File ${filePath} exceeds max size of ${maxSize} bytes`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = {
  sanitizeFilename,
  atomicWriteFileSync,
  safeLoadJsonSync
};
