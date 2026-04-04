/**
 * Minimal observability for operational certainty.
 * Tracks timing, cache behavior, and errors.
 */

export interface ToolInvocation {
  tool: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  success: boolean;
  error?: string;
}

export interface ObservabilityStats {
  serverStartTime: number;
  coldStartMs: number | null;
  warmStartMs: number | null;
  cacheHits: number;
  cacheMisses: number;
  cacheStaleHits: number;
  toolInvocations: Record<string, { count: number; errors: number; totalMs: number; avgMs: number }>;
  totalInvocations: number;
  totalErrors: number;
  uptimeMs: number;
}

class Observability {
  private serverStartTime: number = Date.now();
  private coldStartMs: number | null = null;
  private warmStartMs: number | null = null;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private cacheStaleHits: number = 0;
  private toolStats: Record<string, { count: number; errors: number; totalMs: number }> = {};

  /**
   * Record server cold start time (first schema load)
   */
  recordColdStart(ms: number): void {
    if (this.coldStartMs === null) {
      this.coldStartMs = ms;
      console.error(`[observability] Cold start: ${ms}ms`);
    }
  }

  /**
   * Record warm start time (subsequent loads)
   */
  recordWarmStart(ms: number): void {
    this.warmStartMs = ms;
  }

  /**
   * Record cache hit
   */
  recordCacheHit(): void {
    this.cacheHits++;
  }

  /**
   * Record cache miss (fetch required)
   */
  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  /**
   * Record stale cache usage (fallback)
   */
  recordStaleHit(): void {
    this.cacheStaleHits++;
  }

  /**
   * Start timing a tool invocation
   */
  startTool(tool: string): ToolInvocation {
    return {
      tool,
      startTime: Date.now(),
      success: false,
    };
  }

  /**
   * End timing a tool invocation
   */
  endTool(invocation: ToolInvocation, success: boolean, error?: string): void {
    invocation.endTime = Date.now();
    invocation.durationMs = invocation.endTime - invocation.startTime;
    invocation.success = success;
    invocation.error = error;

    if (!this.toolStats[invocation.tool]) {
      this.toolStats[invocation.tool] = { count: 0, errors: 0, totalMs: 0 };
    }

    const stats = this.toolStats[invocation.tool];
    stats.count++;
    stats.totalMs += invocation.durationMs;
    if (!success) {
      stats.errors++;
    }
  }

  /**
   * Get current stats snapshot
   */
  getStats(): ObservabilityStats {
    const toolInvocations: Record<string, { count: number; errors: number; totalMs: number; avgMs: number }> = {};
    let totalInvocations = 0;
    let totalErrors = 0;

    for (const [tool, stats] of Object.entries(this.toolStats)) {
      toolInvocations[tool] = {
        ...stats,
        avgMs: stats.count > 0 ? Math.round(stats.totalMs / stats.count) : 0,
      };
      totalInvocations += stats.count;
      totalErrors += stats.errors;
    }

    return {
      serverStartTime: this.serverStartTime,
      coldStartMs: this.coldStartMs,
      warmStartMs: this.warmStartMs,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheStaleHits: this.cacheStaleHits,
      toolInvocations,
      totalInvocations,
      totalErrors,
      uptimeMs: Date.now() - this.serverStartTime,
    };
  }

  /**
   * Format stats for logging
   */
  formatStats(): string {
    const stats = this.getStats();
    const uptime = Math.round(stats.uptimeMs / 1000);
    const cacheRate = stats.cacheHits + stats.cacheMisses > 0
      ? Math.round((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100)
      : 0;

    return [
      `Uptime: ${uptime}s`,
      `Cold start: ${stats.coldStartMs ?? 'N/A'}ms`,
      `Cache: ${stats.cacheHits} hits, ${stats.cacheMisses} misses (${cacheRate}% hit rate)`,
      `Invocations: ${stats.totalInvocations} total, ${stats.totalErrors} errors`,
    ].join(' | ');
  }
}

// Singleton instance
export const observability = new Observability();
