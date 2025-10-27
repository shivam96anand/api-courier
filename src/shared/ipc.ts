export const IPC_CHANNELS = {
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  REQUEST_SEND: 'request:send',
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
} as const;

export type IpcChannelKey = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];