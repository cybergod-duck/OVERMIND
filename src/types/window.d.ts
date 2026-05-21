// ── Global Window API declarations ───────────────────────────────
// These are injected by Electron's preload.cjs via contextBridge.

import type { PrivacyStartupResult, PrivacyHostsResult, PrivacyProcessesResult, PrivacyDnsResult, PrivacySummaryResult } from './privacy'

declare global {
  interface Window {
    systemAPI: {
      getHealth:         () => Promise<any>
      ollamaPull:        (model: string) => Promise<string>
      ollamaList:        () => Promise<any>
      writeEnv:          (entries: Record<string, string>) => Promise<any>
      killPort:          (port: number) => Promise<any>
      runCommand:        (cmd: string) => Promise<any>
      proxyFetch:        (url: string, options: any) => Promise<any>
      anthropicRequest:  (args: { endpoint: string; method?: string; headers: any; body?: any }) => Promise<any>
      moonshotRequest:   (args: { endpoint: string; method?: string; headers: any; body?: any }) => Promise<any>
    }
    settingsAPI: {
      get:    (key: string) => Promise<any>
      set:    (key: string, value: any) => Promise<boolean>
      getAll: () => Promise<Record<string, any>>
      reset:  () => Promise<boolean>
    }
    folderAPI: {
      pick:           () => Promise<string | null>
      list:           (folderPath: string) => Promise<string>
      readFile:       (filePath: string) => Promise<string>
      openInExplorer: (folderPath: string) => Promise<boolean>
      addWatched:     (folderPath: string) => Promise<boolean>
      getWatched:     () => Promise<string[]>
      removeWatched:  (folderPath: string) => Promise<boolean>
      listJson:       (folderPath: string) => Promise<{ error: string | null; files: { name: string; path: string; isDir: boolean; ext: string }[] }>
      moveFile:       (args: { sourcePath: string; targetPath: string }) => Promise<{ success: boolean; error?: string }>
      renameFile:     (args: { filePath: string; newName: string }) => Promise<{ success: boolean; error?: string }>
      deleteFile:     (args: { filePath: string }) => Promise<{ success: boolean; error?: string }>
      createFolder:   (args: { folderPath: string }) => Promise<{ success: boolean; error?: string }>
      organizeSmart:  (args: { folderPath: string }) => Promise<{ success: boolean; moved: number; errors: string[]; folders: string[] }>
    }
    doctorAPI: {
      cleanTemp:       () => Promise<{ success: boolean; removed: number; freedMB: number; errors: string[] }>
      findLargeFiles:  (args: { folderPath?: string; minMB?: number }) => Promise<{ files: { path: string; sizeMB: number }[] }>
      findDuplicates:  (args: { folderPath?: string }) => Promise<{ groups: { size: number; files: string[] }[] }>
      diskSpaceReport: () => Promise<{ drives: any[]; watchedFolderSizes: any[]; suggestions: string[] }>
      backupFolders:   () => Promise<{ success: boolean; path: string; error?: string }>
      deepClean:       () => Promise<{ success: boolean; steps: { name: string; ok: boolean; detail: string }[] }>
    }
    setupAPI: {
      checkOllamaInstalled: () => Promise<{ installed: boolean; version: string | null }>
      checkDiskSpace:       () => Promise<{ freeGB: number; totalGB: number }>
      installOllama:        () => Promise<{ success: boolean; error?: string }>
      ollamaPull:           (model: string) => Promise<{ success: boolean; model: string; error?: string }>
      onLog:                (callback: (line: string) => void) => () => void
    }
    privacyAPI: {
      scanStartup:   () => Promise<PrivacyStartupResult>
      scanHosts:     () => Promise<PrivacyHostsResult>
      scanProcesses: () => Promise<PrivacyProcessesResult>
      scanDnsConfig: () => Promise<PrivacyDnsResult>
      scanSummary:   () => Promise<PrivacySummaryResult>
      getHistory:    () => Promise<PrivacySummaryResult[]>
    }
    fileAPI: {
      pickAndRead: () => Promise<{
        fileName: string
        content: string
        sizeBytes: number
        ext: string
        pageCount?: number
        error?: string
      } | null>
    }
    browserAPI: {
      getStatus:      () => Promise<{ connected: boolean; clients: number }>
      sendAction:     (msg: any) => Promise<void>
      getLastContext: () => Promise<any>
    }
    privacyRemediationAPI: {
      openStartupFolder: () => Promise<{ success: boolean }>
      openRegKey:        (params: { key: string }) => Promise<{ success: boolean; note?: string }>
      killProcess:       (params: { pid: number; name: string }) => Promise<{ success: boolean; pid?: number; error?: string }>
      openHostsFile:     () => Promise<{ success: boolean }>
      openDnsSettings:   () => Promise<{ success: boolean }>
      backupHostsFile:   () => Promise<{ success: boolean; backupPath?: string }>
    }
  }
}
