const fs = require('fs');
const path = require('path');
const profileManager = require('./profileManager');

class SyncManager {
  async exportProfile(profileId, targetZipPath) {
    return new Promise(async (resolve, reject) => {
      try {
        const profilePath = path.join(profileManager.profilesDir, profileId);
        if (!fs.existsSync(profilePath)) return reject(new Error('Profile not found'));

        // Dynamic import for ESM package 'archiver'
        let archiver;
        try {
          archiver = (await import('archiver')).default;
        } catch (importErr) {
          console.error("Failed to dynamically import archiver:", importErr);
          return reject(importErr);
        }
        
        const output = fs.createWriteStream(targetZipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve(true));
        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        archive.directory(profilePath, false); // Add all files in profile directory
        archive.finalize();
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = new SyncManager();
