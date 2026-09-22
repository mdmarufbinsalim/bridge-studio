export type SessionState =
  | 'idle'
  | 'connecting'
  | 'handshaking'
  | 'active'
  | 'reconnecting'
  | 'closed';
