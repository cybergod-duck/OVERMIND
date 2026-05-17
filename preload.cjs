const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('lockboxTools', {
  diagnoseNetwork: () => ipcRenderer.invoke('lockbox:diagnoseNetwork'),
  diagnoseSystem: () => ipcRenderer.invoke('lockbox:diagnoseSystem'),
  listFolder: (folderPath) => ipcRenderer.invoke('lockbox:listFolder', folderPath),
})

contextBridge.exposeInMainWorld('systemAPI', {
  getHealth:  ()                       => ipcRenderer.invoke('system:health'),
  ollamaPull: (model)                 => ipcRenderer.invoke('system:ollama-pull', model),
  ollamaList: ()                       => ipcRenderer.invoke('system:ollama-list'),
  writeEnv:   (entries)               => ipcRenderer.invoke('system:write-env', entries),
  killPort:   (port)                  => ipcRenderer.invoke('system:kill-port', port),
  runCommand: (cmd)                   => ipcRenderer.invoke('system:run-command', cmd),
});

contextBridge.exposeInMainWorld('settingsAPI', {
  get:    (key)                       => ipcRenderer.invoke('settings:get', key),
  set:    (key, value)                => ipcRenderer.invoke('settings:set', key, value),
  getAll: ()                           => ipcRenderer.invoke('settings:getAll'),
  reset:  ()                           => ipcRenderer.invoke('settings:reset'),
});

contextBridge.exposeInMainWorld('folderAPI', {
  pick:             ()                => ipcRenderer.invoke('folder:pick'),
  list:             (folderPath)      => ipcRenderer.invoke('folder:list', folderPath),
  readFile:         (filePath)        => ipcRenderer.invoke('folder:readFile', filePath),
  openInExplorer:   (folderPath)      => ipcRenderer.invoke('folder:openInExplorer', folderPath),
  addWatched:       (folderPath)      => ipcRenderer.invoke('folder:addWatched', folderPath),
  getWatched:       ()                => ipcRenderer.invoke('folder:getWatched'),
  removeWatched:    (folderPath)      => ipcRenderer.invoke('folder:removeWatched', folderPath),
  listJson:         (folderPath)      => ipcRenderer.invoke('folder:list-json', folderPath),
  moveFile:         (sourcePath, targetPath) => ipcRenderer.invoke('folder:moveFile', { sourcePath, targetPath }),
  renameFile:       (filePath, newName)      => ipcRenderer.invoke('folder:renameFile', { filePath, newName }),
  deleteFile:       (filePath)               => ipcRenderer.invoke('folder:deleteFile', { filePath }),
  createFolder:     (folderPath)             => ipcRenderer.invoke('folder:createFolder', { folderPath }),
  organizeSmart:    (folderPath)             => ipcRenderer.invoke('folder:organizeSmart', { folderPath }),
});

// ── Browser Bridge IPC ───────────────────────────────────────

contextBridge.exposeInMainWorld('browserAPI', {
  getStatus:       ()                      => ipcRenderer.invoke('browser:get-status'),
  sendAction:      (msg)                  => ipcRenderer.invoke('browser:send-action', msg),
  getLastContext:  ()                      => ipcRenderer.invoke('browser:get-last-context'),
});

// ── Setup / first-run wizard IPC ──────────────────────────────

contextBridge.exposeInMainWorld('setupAPI', {
  checkOllamaInstalled: ()            => ipcRenderer.invoke('setup:check-ollama-installed'),
  checkDiskSpace:       ()            => ipcRenderer.invoke('setup:check-disk-space'),
  installOllama:        ()            => ipcRenderer.invoke('setup:install-ollama'),
  ollamaPull:           (model)      => ipcRenderer.invoke('setup:ollama-pull', model),
  onLog:                (callback)   => {
    const handler = (_e, data) => callback(data)
    ipcRenderer.on('setup:log', handler)
    // Return cleanup function
    return () => ipcRenderer.removeListener('setup:log', handler)
  }
});

// ── Privacy Sentinel IPC ─────────────────────────────────────

contextBridge.exposeInMainWorld('privacyAPI', {
  scanStartup:   ()                      => ipcRenderer.invoke('privacy:scan-startup'),
  scanHosts:     ()                      => ipcRenderer.invoke('privacy:scan-hosts'),
  scanProcesses: ()                      => ipcRenderer.invoke('privacy:scan-processes'),
  scanDnsConfig: ()                      => ipcRenderer.invoke('privacy:scan-dns-config'),
  scanSummary:   ()                      => ipcRenderer.invoke('privacy:scan-summary'),
  getHistory:    ()                      => ipcRenderer.invoke('privacy:get-history'),
});

// ── Privacy Remediation API ──────────────────────────────────

contextBridge.exposeInMainWorld('privacyRemediationAPI', {
  openStartupFolder: ()                => ipcRenderer.invoke('privacy:open-startup-folder'),
  openRegKey:        (params)          => ipcRenderer.invoke('privacy:open-reg-key', params),
  killProcess:       (params)          => ipcRenderer.invoke('privacy:kill-process', params),
  openHostsFile:     ()                => ipcRenderer.invoke('privacy:open-hosts-file'),
  openDnsSettings:   ()                => ipcRenderer.invoke('privacy:open-dns-settings'),
  backupHostsFile:   ()                => ipcRenderer.invoke('privacy:backup-hosts-file'),
});

// ── System Doctor IPC (maintenance tools) ─────────────────────

contextBridge.exposeInMainWorld('doctorAPI', {
  cleanTemp:       ()                      => ipcRenderer.invoke('doctor:cleanTemp'),
  findLargeFiles:  (folderPath, minMB)    => ipcRenderer.invoke('doctor:findLargeFiles', { folderPath, minMB }),
  findDuplicates:  (folderPath)           => ipcRenderer.invoke('doctor:findDuplicates', { folderPath }),
  diskSpaceReport: ()                      => ipcRenderer.invoke('doctor:diskSpaceReport'),
  backupFolders:   ()                      => ipcRenderer.invoke('doctor:backupFolders'),
  deepClean:       ()                      => ipcRenderer.invoke('doctor:deepClean'),
});
