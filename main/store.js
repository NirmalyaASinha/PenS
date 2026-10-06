const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const profileManager = require('./profileManager');
const utils = require('./utils');

function normalizeUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    u.hash = ''; // ignore hashes
    let norm = u.toString().replace(/\/$/, '');
    return norm;
  } catch (e) {
    return urlStr;
  }
}

function getIndexFile(profileId) {
  return path.join(profileManager.getNotesPath(profileId), 'notes_index.json');
}

function getIndex(profileId) {
  const indexFile = getIndexFile(profileId);
  return utils.safeLoadJsonSync(indexFile) || { notes: {} };
}

function saveIndex(profileId, index) {
  utils.atomicWriteFileSync(getIndexFile(profileId), JSON.stringify(index, null, 2));
}

function migrateIfNecessary(profileId) {
  const notesDir = profileManager.getNotesPath(profileId);
  const indexFile = getIndexFile(profileId);
  if (fs.existsSync(indexFile)) return;

  const index = { notes: {} };
  const backupDir = path.join(notesDir, '..', 'notes_backup_' + Date.now());
  fs.mkdirSync(backupDir, { recursive: true });

  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.json') && f !== 'notes_index.json');
  
  for (const f of files) {
    const p = path.join(notesDir, f);
    fs.copyFileSync(p, path.join(backupDir, f)); // Backup

    try {
      const data = utils.safeLoadJsonSync(p);
      if (data && data.source) {
        const id = data.source.url || data.source.id;
        const normId = data.source.type === 'web' ? normalizeUrl(id) : id;
        
        if (!index.notes[normId]) {
          const newFile = crypto.randomBytes(16).toString('hex') + '.json';
          index.notes[normId] = {
            id: normId,
            title: data.source.title || normId,
            type: data.source.type || 'web',
            source: id,
            created: Date.now(),
            updated: Date.now(),
            strokeCount: data.strokes ? data.strokes.length : 0,
            pageCount: 1,
            tags: [],
            favorite: false,
            thumbnail: '',
            file: newFile
          };
          utils.atomicWriteFileSync(path.join(notesDir, newFile), JSON.stringify(data, null, 2));
        } else {
          // Merge duplicates
          const existingMeta = index.notes[normId];
          const existingData = utils.safeLoadJsonSync(path.join(notesDir, existingMeta.file));
          if (data.strokes) {
             existingData.strokes = (existingData.strokes || []).concat(data.strokes);
             existingMeta.strokeCount = existingData.strokes.length;
             existingMeta.updated = Date.now();
             utils.atomicWriteFileSync(path.join(notesDir, existingMeta.file), JSON.stringify(existingData, null, 2));
          }
        }
      }
      fs.renameSync(p, p + '.migrated'); // hide old file
    } catch (e) {
      console.error(e);
    }
  }
  
  saveIndex(profileId, index);
}

function getFilePath(profileId, normId, defaultData = null) {
  migrateIfNecessary(profileId);
  const index = getIndex(profileId);
  if (index.notes[normId]) {
    return path.join(profileManager.getNotesPath(profileId), index.notes[normId].file);
  }
  
  const newFile = crypto.randomBytes(16).toString('hex') + '.json';
  index.notes[normId] = {
    id: normId,
    title: defaultData?.title || normId,
    type: defaultData?.type || 'web',
    source: normId,
    created: Date.now(),
    updated: Date.now(),
    strokeCount: 0,
    pageCount: 1,
    tags: [],
    favorite: false,
    thumbnail: '',
    file: newFile
  };
  saveIndex(profileId, index);
  return path.join(profileManager.getNotesPath(profileId), newFile);
}

function saveNotes(profileId, id, data) {
  migrateIfNecessary(profileId);
  const normId = data.source && data.source.type === 'web' ? normalizeUrl(id) : id;
  const filePath = getFilePath(profileId, normId, { title: data.source?.title, type: data.source?.type });
  
  let thumbnail = '';
  if (data.thumbnail) {
    thumbnail = data.thumbnail;
    delete data.thumbnail; // Do not bloat the note file itself
  }

  utils.atomicWriteFileSync(filePath, JSON.stringify(data, null, 2));
  
  const index = getIndex(profileId);
  if (index.notes[normId]) {
    index.notes[normId].strokeCount = data.strokes ? data.strokes.length : 0;
    index.notes[normId].updated = Date.now();
    if (data.source && data.source.type) {
      index.notes[normId].type = data.source.type;
    }
    if (data.source && data.source.title) {
      index.notes[normId].title = data.source.title;
    }
    if (thumbnail) {
      index.notes[normId].thumbnail = thumbnail;
    }
  }
  saveIndex(profileId, index);
}

function loadNotes(profileId, id) {
  migrateIfNecessary(profileId);
  const normId = id.startsWith('http') ? normalizeUrl(id) : id;
  const index = getIndex(profileId);
  if (!index.notes[normId]) return null;
  const filePath = path.join(profileManager.getNotesPath(profileId), index.notes[normId].file);
  return utils.safeLoadJsonSync(filePath) || null;
}

function listNotes(profileId) {
  migrateIfNecessary(profileId);
  const index = getIndex(profileId);
  return Object.values(index.notes);
}

module.exports = { saveNotes, loadNotes, listNotes, normalizeUrl };
