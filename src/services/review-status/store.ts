/**
 * Review Status Store
 * In-memory storage for async review tracking
 *
 * CRITICAL FIX #10: Add TTL expiration for completed/failed reviews
 */

import type { ReviewResult } from '../../schemas/tools.js';

export type ReviewStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface ReviewStatusEntry {
  reviewId: string;
  status: ReviewStatus;
  source: 'codex' | 'gemini' | 'combined';
  startTime: string;
  endTime?: string;
  result?: ReviewResult;
  error?: {
    code: string;
    message: string;
  };
  expiresAt?: string; // TTL timestamp
}

/**
 * In-memory review status store
 *
 * NOTE: This is a single-process store. For multi-instance deployments,
 * use Redis or another shared storage backend.
 */
export class ReviewStatusStore {
  private static instance: ReviewStatusStore;
  private reviews: Map<string, ReviewStatusEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Default TTL: 1 hour for completed/failed reviews
  private readonly DEFAULT_TTL_MS = 60 * 60 * 1000;

  private constructor() {
    // Start cleanup interval (run every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  static getInstance(): ReviewStatusStore {
    if (!ReviewStatusStore.instance) {
      ReviewStatusStore.instance = new ReviewStatusStore();
    }
    return ReviewStatusStore.instance;
  }

  /**
   * Cleanup expired reviews
   */
  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [reviewId, entry] of this.reviews.entries()) {
      if (entry.expiresAt) {
        const expiresAt = new Date(entry.expiresAt).getTime();
        if (now >= expiresAt) {
          expired.push(reviewId);
        }
      }
    }

    for (const reviewId of expired) {
      this.reviews.delete(reviewId);
    }

    if (expired.length > 0) {
      console.log(`Cleaned up ${expired.length} expired review(s)`);
    }
  }

  /**
   * Stop cleanup interval (for testing)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Create a new review status entry
   */
  create(reviewId: string, source: 'codex' | 'gemini' | 'combined'): void {
    this.reviews.set(reviewId, {
      reviewId,
      status: 'pending',
      source,
      startTime: new Date().toISOString(),
    });
  }

  /**
   * Update review status
   * CRITICAL FIX #10: Set TTL when status becomes terminal (completed/failed)
   */
  updateStatus(reviewId: string, status: ReviewStatus): void {
    const entry = this.reviews.get(reviewId);
    if (entry) {
      entry.status = status;
      if (status === 'completed' || status === 'failed') {
        const now = new Date();
        entry.endTime = now.toISOString();
        // Set expiration time (1 hour from now)
        entry.expiresAt = new Date(now.getTime() + this.DEFAULT_TTL_MS).toISOString();
      }
    }
  }

  /**
   * Store review result
   * CRITICAL FIX #10: Set TTL for completed reviews
   */
  setResult(reviewId: string, result: ReviewResult): void {
    const entry = this.reviews.get(reviewId);
    if (entry) {
      const now = new Date();
      entry.status = 'completed';
      entry.result = result;
      entry.endTime = now.toISOString();
      // Set expiration time (1 hour from now)
      entry.expiresAt = new Date(now.getTime() + this.DEFAULT_TTL_MS).toISOString();
    }
  }

  /**
   * Store error
   * CRITICAL FIX #10: Set TTL for failed reviews
   */
  setError(reviewId: string, error: { code: string; message: string }): void {
    const entry = this.reviews.get(reviewId);
    if (entry) {
      const now = new Date();
      entry.status = 'failed';
      entry.error = error;
      entry.endTime = now.toISOString();
      // Set expiration time (1 hour from now)
      entry.expiresAt = new Date(now.getTime() + this.DEFAULT_TTL_MS).toISOString();
    }
  }

  /**
   * Get review status
   */
  get(reviewId: string): ReviewStatusEntry | undefined {
    return this.reviews.get(reviewId);
  }

  /**
   * Check if review exists
   */
  has(reviewId: string): boolean {
    return this.reviews.has(reviewId);
  }

  /**
   * Delete review status (cleanup)
   */
  delete(reviewId: string): boolean {
    return this.reviews.delete(reviewId);
  }

  /**
   * Clear all statuses (for testing)
   */
  clear(): void {
    this.reviews.clear();
  }

  /**
   * Get all review IDs
   */
  getAllIds(): string[] {
    return Array.from(this.reviews.keys());
  }
}
