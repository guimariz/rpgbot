import { Injectable } from '@angular/core';

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  skipAuth?: boolean;
  token?: string;
  lobbyToken?: string;
}

const apiBaseUrl = 'http://localhost:3001/api';

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (!options.skipAuth) {
      headers['Authorization'] = `Bearer ${options.token ?? ''}`;
    }

    if (options.lobbyToken) {
      headers['X-Lobby-Token'] = options.lobbyToken;
    }

    let response: Response;

    try {
      response = await fetch(`${apiBaseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch {
      throw new Error('Backend indisponivel.');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(String(data.error || 'Erro na requisicao.'));
    }

    return data as T;
  }
}
