const title = document.getElementById('lock-title');
const profile = document.getElementById('lock-profile');
const avatar = document.getElementById('lock-avatar');
const form = document.getElementById('unlock-form');
const secret = document.getElementById('unlock-secret');
const button = document.getElementById('unlock-button');
const status = document.getElementById('lock-status');
let retryTimer = null;

function showDelay(message, nextAttemptAt) {
  if (retryTimer) clearInterval(retryTimer);
  const update = () => {
    const remaining = Math.max(0, Math.ceil((nextAttemptAt - Date.now()) / 1000));
    status.textContent = remaining > 0 ? `${message} Try again in ${remaining}s.` : '';
    button.disabled = remaining > 0;
    if (!remaining) clearInterval(retryTimer);
  };
  update();
  retryTimer = setInterval(update, 1000);
}

window.electronAPI.onProfileInfo((info) => {
  const name = info.displayName || info.name || 'Profile';
  title.textContent = `${name} is locked`;
  profile.textContent = 'Unlock to continue';
  if (info.avatar && String(info.avatar).startsWith('data:image/')) {
    avatar.src = info.avatar;
  } else if (info.avatar) {
    avatar.removeAttribute('src');
    avatar.alt = info.avatar;
    avatar.textContent = info.avatar;
  }
});

window.electronAPI.getLockState().then((state) => {
  if (state.nextAttemptAt) showDelay('Too many attempts.', state.nextAttemptAt);
}).catch(() => {});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true;
  status.textContent = 'Checking...';
  try {
    await window.electronAPI.unlockProfile(secret.value);
  } catch (error) {
    const state = await window.electronAPI.getLockState().catch(() => ({}));
    if (error.message.includes('Try again')) showDelay('Too many attempts.', state.nextAttemptAt || Date.now() + 1000);
    else status.textContent = error.message || 'Unable to unlock.';
    secret.select();
    button.disabled = false;
  }
});
