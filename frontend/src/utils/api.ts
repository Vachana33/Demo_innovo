/**
 * API utility functions for making authenticated requests.
 * 
 * Security: Automatically includes JWT token in Authorization header.
 * Handles token expiration and redirects to login if unauthorized.
 */

// Get API base URL from environment variable
const envApiUrl = import.meta.env.VITE_API_URL;
const isProduction = import.meta.env.PROD;

// Validate environment variable in production
if (isProduction && !envApiUrl) {
  console.error(
    "⚠️ VITE_API_URL is not set in production! API calls will fail."
  );
}

// Export API_BASE_URL for use in other files (e.g., LoginPage)
export const API_BASE_URL = envApiUrl || "http://localhost:8000";

/**
 * Get the stored authentication token.
 */
function getAuthToken(): string | null {
  return localStorage.getItem("innovo_auth_token");
}

/**
 * Make an authenticated API request.
 * Automatically includes JWT token in Authorization header.
 * 
 * @param endpoint - API endpoint (without base URL)
 * @param options - Fetch options (method, body, etc.)
 * @returns Promise with response data
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  // Add Authorization header if token exists
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Make request
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized - token expired or invalid
  if (response.status === 401) {
    // Clear invalid token
    localStorage.removeItem("innovo_auth_token");
    
    // Redirect to login if we're not already there
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    
    throw new Error("Authentication required. Please log in again.");
  }

  // Parse response
  const data = await response.json();

  // Throw error if request failed
  if (!response.ok) {
    throw new Error(data.detail || data.message || "Request failed");
  }

  return data;
}

/**
 * Make an authenticated GET request.
 */
export async function apiGet<T = any>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: "GET" });
}

/**
 * Make an authenticated POST request.
 */
export async function apiPost<T = any>(
  endpoint: string,
  body?: any
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Make an authenticated PUT request.
 */
export async function apiPut<T = any>(
  endpoint: string,
  body?: any
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Make an authenticated DELETE request.
 */
export async function apiDelete<T = any>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: "DELETE" });
}

/**
 * Upload a file with authentication.
 */
export async function apiUploadFile(
  endpoint: string,
  file: File,
  additionalData?: Record<string, string>
): Promise<any> {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append("file", file);

  // Add additional form data if provided
  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, value);
    });
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (response.status === 401) {
    localStorage.removeItem("innovo_auth_token");
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new Error("Authentication required. Please log in again.");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || data.message || "Upload failed");
  }

  return data;
}

/**
 * Download a file (returns blob response).
 * Used for PDF/DOCX exports.
 */
export async function apiDownloadFile(endpoint: string): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "GET",
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem("innovo_auth_token");
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new Error("Authentication required. Please log in again.");
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = "Download failed";
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.detail || errorData.message || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  return response;
}

