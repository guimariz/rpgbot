import { Injectable, signal } from '@angular/core';

export type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WsMessage<T = unknown> {
  type: string;
  payload: T;
}

@Injectable({ providedIn: 'root' })
export class WsService {
  private socket?: WebSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  readonly status = signal<WsStatus>('disconnected');
  readonly lastMessage = signal<WsMessage | null>(null);

  connect(url: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) return;

    this.status.set('connecting');
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.status.set('connected');
    };

    this.socket.onmessage = (ev: MessageEvent) => {
      try {
        this.lastMessage.set(JSON.parse(ev.data) as WsMessage);
      } catch { /* ignore malformed messages */ }
    };

    this.socket.onerror = () => {
      this.status.set('error');
    };

    this.socket.onclose = () => {
      this.status.set('disconnected');
      this.scheduleReconnect(url);
    };
  }

  send<T>(type: string, payload: T): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type, payload }));
  }

  disconnect(): void {
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = undefined;
  }

  private scheduleReconnect(url: string, delayMs = 3000): void {
    this.reconnectTimer = setTimeout(() => this.connect(url), delayMs);
  }
}
