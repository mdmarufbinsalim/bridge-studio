import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  host: string;
  port: number;
  status: ConnectionStatus;
  errorMessage?: string;
  playbackEnabled: boolean;
  microphoneEnabled: boolean;
}

const initialState: ConnectionState = {
  host: '',
  port: 7711,
  status: 'disconnected',
  playbackEnabled: true,
  microphoneEnabled: false,
};

const connectionSlice = createSlice({
  name: 'connection',
  initialState,
  reducers: {
    setAddress(state, action: PayloadAction<{ host: string; port: number }>) {
      state.host = action.payload.host;
      state.port = action.payload.port;
    },
    setStatus(state, action: PayloadAction<ConnectionStatus>) {
      state.status = action.payload;
      if (action.payload !== 'error') state.errorMessage = undefined;
    },
    setError(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.errorMessage = action.payload;
    },
    setPlaybackEnabled(state, action: PayloadAction<boolean>) {
      state.playbackEnabled = action.payload;
    },
    setMicrophoneEnabled(state, action: PayloadAction<boolean>) {
      state.microphoneEnabled = action.payload;
    },
  },
});

export const { setAddress, setStatus, setError, setPlaybackEnabled, setMicrophoneEnabled } =
  connectionSlice.actions;
export default connectionSlice.reducer;
