import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from './api.service';
import { UserDto } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly user = signal<UserDto | null>(null);
  readonly isAdmin = computed(() => this.user()?.role === 'Admin');
  private loaded = false;

  async ensureLoaded(): Promise<UserDto | null> {
    if (this.loaded) return this.user();
    try {
      this.user.set(await this.api.get<UserDto>('auth/me'));
    } catch {
      this.user.set(null);
    }
    this.loaded = true;
    return this.user();
  }

  async login(username: string, password: string): Promise<UserDto> {
    const user = await this.api.post<UserDto>('auth/login', { username, password });
    this.user.set(user);
    this.loaded = true;
    return user;
  }

  async logout(): Promise<void> {
    try { await this.api.post('auth/logout'); } finally {
      this.user.set(null);
      this.router.navigateByUrl('/login');
    }
  }

  markUnauthenticated(): void {
    this.user.set(null);
    this.loaded = true;
  }
}

export const authGuard: CanActivateFn = async (_r, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.ensureLoaded();
  if (!user) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  if (user.mustChangePassword && !state.url.startsWith('/account')) return router.createUrlTree(['/account'], { queryParams: { force: 1 } });
  return true;
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  await auth.ensureLoaded();
  return auth.isAdmin() ? true : inject(Router).createUrlTree(['/']);
};
