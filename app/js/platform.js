// Platform adapter: same web core runs in Electron (Windows) and Capacitor/browser (Android).
(function () {
  const isElectron = !!(window.process && window.process.versions && window.process.versions.electron);
  let ipc = null;
  if (isElectron) {
    ipc = window.require('electron').ipcRenderer;
  }

  const SETTINGS_KEY = 'glance.settings';

  window.Platform = {
    isElectron,

    async getSettings() {
      if (isElectron) return ipc.invoke('get-settings');
      try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
    },

    async saveSettings(s) {
      if (isElectron) { ipc.send('save-settings', s); return; }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    },

    async loadBundledLibrary() {
      if (isElectron) return ipc.invoke('get-bundled-library');
      const res = await fetch('data/cet6.json');
      return res.text();
    },

    async pickLibrary() {
      if (isElectron) {
        const r = await ipc.invoke('dialog:openLibrary');
        return r ? { name: r.filePath, text: r.content } : null;
      }
      return new Promise(resolve => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.json,.tsv,.txt';
        inp.onchange = () => {
          const f = inp.files && inp.files[0];
          if (!f) return resolve(null);
          const rd = new FileReader();
          rd.onload = () => resolve({ name: f.name, text: String(rd.result) });
          rd.onerror = () => resolve(null);
          rd.readAsText(f);
        };
        inp.click();
      });
    },

    openOverlay() { if (isElectron) ipc.send('open-overlay-window'); }
  };
})();