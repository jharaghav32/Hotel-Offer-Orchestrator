import { withTimeout } from '../shared/timeout';
import type { HealthCheck } from './health.checks';

export type ComponentStatus = 'up' | 'down';
export type OverallStatus = 'ok' | 'degraded' | 'down';

export interface ComponentHealth {
  status: ComponentStatus;
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  status: OverallStatus;
  timestamp: string;
  checks: Record<string, ComponentHealth>;
}

interface CheckOutcome {
  check: HealthCheck;
  result: ComponentHealth;
}

export interface HealthServiceOptions {
  timeoutMs: number;
  now?: () => Date;
}

export class HealthService {
  private readonly timeoutMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly checks: readonly HealthCheck[],
    { timeoutMs, now = () => new Date() }: HealthServiceOptions,
  ) {
    this.timeoutMs = timeoutMs;
    this.now = now;
  }

  async report(): Promise<HealthReport> {
    const outcomes = await Promise.all(this.checks.map((check) => this.execute(check)));

    return {
      status: this.overallStatus(outcomes),
      timestamp: this.now().toISOString(),
      checks: Object.fromEntries(outcomes.map(({ check, result }) => [check.name, result])),
    };
  }

  private async execute(check: HealthCheck): Promise<CheckOutcome> {
    const startedAt = performance.now();
    const latency = () => Math.round(performance.now() - startedAt);

    try {
      await withTimeout(check.run(), this.timeoutMs);
      return { check, result: { status: 'up', latencyMs: latency() } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { check, result: { status: 'down', latencyMs: latency(), error: message } };
    }
  }

  private overallStatus(outcomes: readonly CheckOutcome[]): OverallStatus {
    const isDown = ({ result }: CheckOutcome) => result.status === 'down';
    const dependencies = outcomes.filter(({ check }) => check.kind === 'dependency');
    const suppliers = outcomes.filter(({ check }) => check.kind === 'supplier');

    if (dependencies.some(isDown) || (suppliers.length > 0 && suppliers.every(isDown))) {
      return 'down';
    }
    return outcomes.some(isDown) ? 'degraded' : 'ok';
  }
}
