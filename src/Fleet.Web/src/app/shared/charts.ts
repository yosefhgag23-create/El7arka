import { Component, input } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';
import { fmtMoney, fmtNumber } from '../core/format';
import { EmptyState } from './ui';

export const PALETTE = ['#18181b', '#71717a', '#a1a1aa', '#d4d4d8', '#15803d', '#b45309', '#1d4ed8', '#b91c1c', '#0f766e', '#7c3aed'];
const FONT = "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif";
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export const monthLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;

export interface Series { name: string; data: number[]; color?: string; }

const base = (money: boolean): EChartsCoreOption => ({
  color: PALETTE,
  textStyle: { fontFamily: FONT, color: '#3f3f46' },
  tooltip: {
    trigger: 'axis', confine: true, textStyle: { fontFamily: FONT }, axisPointer: { type: 'shadow' },
    valueFormatter: (v: number) => (money ? fmtMoney(v) : fmtNumber(v)),
  },
  legend: { bottom: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { fontFamily: FONT } },
  grid: { left: 12, right: 12, top: 16, bottom: 36, containLabel: true },
});

const valueAxis = (money: boolean) => ({
  type: 'value',
  position: 'right',
  splitLine: { lineStyle: { color: '#f4f4f5' } },
  axisLabel: { color: '#71717a', formatter: (v: number) => (money ? compact(v) : fmtNumber(v)) },
});

const categoryAxis = (categories: string[]) => ({
  type: 'category', data: categories, inverse: true,
  axisLine: { lineStyle: { color: '#e4e4e7' } }, axisTick: { show: false },
  axisLabel: { color: '#71717a', hideOverlap: true },
});

export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${fmtNumber(v / 1_000_000, 1)}M`;
  if (a >= 1_000) return `${fmtNumber(v / 1_000, 0)}K`;
  return fmtNumber(v);
}

export function barChart(categories: string[], series: Series[], opts: { stacked?: boolean; money?: boolean; horizontal?: boolean } = {}): EChartsCoreOption {
  const money = opts.money ?? true;
  const s = series.map(x => ({
    name: x.name, type: 'bar', data: x.data, stack: opts.stacked ? 'total' : undefined, barMaxWidth: 28,
    itemStyle: { color: x.color, borderRadius: opts.stacked ? 0 : [3, 3, 0, 0] }, emphasis: { focus: 'series' },
  }));
  if (opts.horizontal) {
    return {
      ...base(money),
      legend: series.length > 1 ? (base(money) as any).legend : { show: false },
      grid: { left: 12, right: 12, top: 8, bottom: series.length > 1 ? 36 : 8, containLabel: true },
      xAxis: { ...valueAxis(money), position: 'bottom', inverse: true },
      yAxis: { ...categoryAxis(categories), position: 'right', inverse: true },
      series: s,
    };
  }
  return {
    ...base(money),
    legend: series.length > 1 ? (base(money) as any).legend : { show: false },
    xAxis: categoryAxis(categories),
    yAxis: valueAxis(money),
    series: s,
  };
}

export function lineChart(categories: string[], series: Series[], opts: { money?: boolean; area?: boolean } = {}): EChartsCoreOption {
  const money = opts.money ?? true;
  return {
    ...base(money),
    tooltip: { ...(base(money) as any).tooltip, axisPointer: { type: 'line' } },
    legend: series.length > 1 ? (base(money) as any).legend : { show: false },
    xAxis: { ...categoryAxis(categories), boundaryGap: false },
    yAxis: valueAxis(money),
    series: series.map(x => ({
      name: x.name, type: 'line', data: x.data, smooth: 0.3, symbol: 'circle', symbolSize: 6,
      lineStyle: { width: 2, color: x.color }, itemStyle: { color: x.color },
      areaStyle: opts.area ? { opacity: 0.06 } : undefined,
    })),
  };
}

export function donutChart(data: { name: string; value: number }[], opts: { money?: boolean } = {}): EChartsCoreOption {
  const money = opts.money ?? true;
  return {
    color: PALETTE,
    textStyle: { fontFamily: FONT },
    tooltip: {
      trigger: 'item', confine: true, textStyle: { fontFamily: FONT },
      formatter: (p: any) => `${p.name}<br/><b>${money ? fmtMoney(p.value) : fmtNumber(p.value)}</b> (${fmtNumber(p.percent, 1)}%)`,
    },
    legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'middle', icon: 'circle', itemWidth: 8, textStyle: { fontFamily: FONT } },
    series: [{
      type: 'pie', radius: ['52%', '78%'], center: ['35%', '50%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 }, label: { show: false }, data,
    }],
  };
}

@Component({
  selector: 'app-chart',
  imports: [NgxEchartsDirective, EmptyState],
  template: `
    @if (loading()) {
      <div class="skeleton" [style.height]="height()"></div>
    } @else if (empty()) {
      <div [style.height]="height()" style="display:grid;place-items:center">
        <app-empty icon="bar_chart" title="لا توجد بيانات للفترة المحددة" />
      </div>
    } @else {
      <div echarts [options]="options()!" [style.height]="height()" style="width:100%"></div>
    }
  `,
})
export class Chart {
  options = input<EChartsCoreOption | null>(null);
  loading = input(false);
  empty = input(false);
  height = input('300px');
}

/** True when every value in all series is zero/empty. */
export const allZero = (...arrays: number[][]) => arrays.every(a => !a.length || a.every(v => !v));
