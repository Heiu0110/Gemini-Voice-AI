export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

export interface AudioVisualizerProps {
  stream?: MediaStream;
  audioContext?: AudioContext;
  sourceNode?: AudioNode;
  isActive: boolean;
  barColor?: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
