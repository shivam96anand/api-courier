export const IPC_CHANNELS = {
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  REQUEST_SEND: 'request:send',
  REQUEST_CANCEL: 'request:cancel',
  COLLECTION_CREATE: 'collection:create',
  COLLECTION_UPDATE: 'collection:update',
  COLLECTION_DELETE: 'collection:delete',

  // Load Testing channels
  LOADTEST_START: 'loadtest:start',
  LOADTEST_PROGRESS: 'loadtest:progress',
  LOADTEST_SUMMARY: 'loadtest:summary',
  LOADTEST_CANCEL: 'loadtest:cancel',
  LOADTEST_EXPORT_CSV: 'loadtest:export-csv',
  LOADTEST_EXPORT_PDF: 'loadtest:export-pdf',

  // OAuth channels
  OAUTH_START_FLOW: 'oauth:start-flow',
  OAUTH_REFRESH_TOKEN: 'oauth:refresh-token',
  OAUTH_GET_TOKEN_INFO: 'oauth:get-token-info',

  // File operations channels
  FILE_OPEN_DIALOG: 'file:open-dialog',
  FILE_READ_CONTENT: 'file:read-content',

  // Import channels
  IMPORT_PARSE_PREVIEW: 'import:parse-preview',
  IMPORT_COMMIT: 'import:commit',

  // Collections UI state channels
  COLLECTIONS_STATE_GET: 'collections-state:get',
  COLLECTIONS_STATE_SET: 'collections-state:set',

  // System helpers
  OPEN_EXTERNAL: 'system:open-external',

  // AI Chat channels
  AI_GET_SESSIONS: 'ai:get-sessions',
  AI_CREATE_SESSION: 'ai:create-session',
  AI_DELETE_SESSION: 'ai:delete-session',
  AI_SEND_MESSAGE: 'ai:send-message',
  AI_MESSAGE_STREAM: 'ai:message-stream',
  AI_CHECK_ENGINE: 'ai:check-engine',
  AI_UPDATE_SESSION: 'ai:update-session',

  // Notepad channels
  NOTEPAD_SAVE_FILE: 'notepad:save-file',
  NOTEPAD_OPEN_FILE: 'notepad:open-file',
  NOTEPAD_READ_FILE: 'notepad:read-file',
  NOTEPAD_REVEAL: 'notepad:reveal',
} as const;

export type IpcChannelKey = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
