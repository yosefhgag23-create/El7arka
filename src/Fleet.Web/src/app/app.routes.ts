import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth.service';
import { LookupsService } from './core/lookups.service';
import { Login } from './layout/login';
import { Shell } from './layout/shell';

export const routes: Routes = [
  { path: 'login', component: Login, title: 'تسجيل الدخول' },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    resolve: { lookups: () => inject(LookupsService).load() },
    children: [
      { path: '', loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard), title: 'لوحة التحكم' },
      { path: 'account', loadComponent: () => import('./layout/account').then(m => m.Account), title: 'الحساب' },

      { path: 'projects', loadComponent: () => import('./features/projects/project-list').then(m => m.ProjectList), title: 'المشروعات' },
      { path: 'projects/new', loadComponent: () => import('./features/projects/project-form').then(m => m.ProjectForm), title: 'مشروع جديد' },
      { path: 'projects/:id/edit', loadComponent: () => import('./features/projects/project-form').then(m => m.ProjectForm), title: 'تعديل مشروع' },
      { path: 'projects/:id', loadComponent: () => import('./features/projects/project-details').then(m => m.ProjectDetails), title: 'تفاصيل المشروع' },

      { path: 'equipment', loadComponent: () => import('./features/equipment/equipment-list').then(m => m.EquipmentList), title: 'المعدات' },
      { path: 'equipment/new', loadComponent: () => import('./features/equipment/equipment-form').then(m => m.EquipmentForm), title: 'معدة جديدة' },
      { path: 'equipment/:id/edit', loadComponent: () => import('./features/equipment/equipment-form').then(m => m.EquipmentForm), title: 'تعديل معدة' },
      { path: 'equipment/:id', loadComponent: () => import('./features/equipment/equipment-details').then(m => m.EquipmentDetails), title: 'تفاصيل المعدة' },

      { path: 'drivers', loadComponent: () => import('./features/drivers/driver-list').then(m => m.DriverList), title: 'السائقون' },
      { path: 'drivers/new', loadComponent: () => import('./features/drivers/driver-form').then(m => m.DriverForm), title: 'سائق جديد' },
      { path: 'drivers/:id/edit', loadComponent: () => import('./features/drivers/driver-form').then(m => m.DriverForm), title: 'تعديل سائق' },
      { path: 'drivers/:id', loadComponent: () => import('./features/drivers/driver-details').then(m => m.DriverDetails), title: 'تفاصيل السائق' },

      { path: 'assignments', loadComponent: () => import('./features/assignments/assignments').then(m => m.Assignments), title: 'توزيع المعدات' },
      { path: 'fuel', loadComponent: () => import('./features/fuel/fuel').then(m => m.FuelPage), title: 'الوقود' },
      { path: 'maintenance', loadComponent: () => import('./features/maintenance/maintenance').then(m => m.MaintenancePage), title: 'الصيانة' },
      { path: 'expenses', loadComponent: () => import('./features/expenses/expenses').then(m => m.ExpensesPage), title: 'مصروفات التشغيل' },
      { path: 'overtime', loadComponent: () => import('./features/overtime/overtime').then(m => m.OvertimePage), title: 'الوقت الإضافي' },
      { path: 'depreciation', loadComponent: () => import('./features/depreciation/depreciation').then(m => m.DepreciationPage), title: 'الإهلاك' },
      { path: 'reports', loadComponent: () => import('./features/reports/reports').then(m => m.ReportsPage), title: 'التقارير' },
      { path: 'settings', canActivate: [adminGuard], loadComponent: () => import('./features/settings/settings').then(m => m.SettingsPage), title: 'الإعدادات' },
    ],
  },
  { path: '**', redirectTo: '' },
];
