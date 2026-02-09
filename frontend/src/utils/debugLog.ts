/**
 * Debug logging utility for development debugging.
 * Only logs when VITE_DEBUG_LOG_URL is set in environment variables.
 * In production, this will silently do nothing (no errors, no network calls).
 */

const DEBUG_LOG_URL = import.meta.env.VITE_DEBUG_LOG_URL;

/**
 * Logs debug information to the debug ingest endpoint.
 * Only works when VITE_DEBUG_LOG_URL is configured.
 * 
 * @param location - File and function location (e.g., "file.ts:function:ENTRY")
 * @param message - Log message
 * @param data - Additional data to log
 * @param hypothesisId - Optional hypothesis ID for debugging
 */
export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  hypothesisId?: string
): void {
  // Only log if DEBUG_LOG_URL is configured (development/debugging mode)
  if (!DEBUG_LOG_URL) {
    return; // Silently skip in production
  }

  // Use a try-catch to ensure logging never breaks the app
  try {
    const payload: Record<string, unknown> = {
      location,
      message,
      data,
      timestamp: Date.now(),
    };

    if (hypothesisId) {
      payload.hypothesisId = hypothesisId;
    }

    // Fire and forget - don't await, don't block
    fetch(DEBUG_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silently ignore fetch errors (network issues, CORS, etc.)
    });
  } catch (error) {
    // Silently ignore any errors in the logging code itself
    // This ensures logging never breaks the application
    if (import.meta.env.DEV) {
      console.warn("Debug log failed:", error);
    }
  }
}
