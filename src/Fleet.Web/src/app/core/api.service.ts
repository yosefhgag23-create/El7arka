import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;
/** Any flat object of query values (interfaces such as Period lack an index signature). */
type QueryLike = Query | object;

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  static params(q?: QueryLike): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries((q ?? {}) as Query)) {
      if (v === null || v === undefined || v === '') continue;
      p = p.set(k, String(v));
    }
    return p;
  }

  get<T>(url: string, q?: QueryLike): Promise<T> {
    return firstValueFrom(this.http.get<T>(`/api/${url}`, { params: ApiService.params(q) }));
  }

  post<T = void>(url: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(`/api/${url}`, body));
  }

  put<T = void>(url: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(`/api/${url}`, body));
  }

  delete<T = void>(url: string, q?: QueryLike): Promise<T> {
    return firstValueFrom(this.http.delete<T>(`/api/${url}`, { params: ApiService.params(q) }));
  }

  upload<T>(url: string, file: File, q?: QueryLike): Promise<T> {
    const form = new FormData();
    form.append('file', file, file.name);
    return firstValueFrom(this.http.post<T>(`/api/${url}`, form, { params: ApiService.params(q) }));
  }

  async download(url: string, q?: QueryLike): Promise<void> {
    const res = await firstValueFrom(this.http.get(`/api/${url}`, { params: ApiService.params(q), responseType: 'blob', observe: 'response' }));
    const cd = res.headers.get('content-disposition') ?? '';
    const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
    const name = decodeURIComponent(match?.[1] ?? match?.[2] ?? 'report');
    const blobUrl = URL.createObjectURL(res.body!);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  }

  static attachmentUrl(id?: number | null, download = false): string | null {
    return id ? `/api/attachments/${id}${download ? '?download=true' : ''}` : null;
  }
}
