/**
 * API utility functions for making authenticated requests.
 */

const envApiUrl = import.meta.env.VITE_API_URL;
const isProduction = import.meta.env.PROD;

if (isProduction && !envApiUrl) {
  console.error("⚠️ VITE_API_URL is not set in production!");
}

export const API_BASE_URL = envApiUrl || "http://localhost:8000";

const TOKEN_STORAGE_KEY = "innovo_auth_token";
const USER_EMAIL_KEY = "innovo_user_email";

function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiRequest:ENTRY',message:'API request started',data:{endpoint,method:options.method||'GET'},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  const token = getAuthToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiRequest:BEFORE_FETCH',message:'About to fetch',data:{url:`${API_BASE_URL}${endpoint}`,hasToken:!!token},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiRequest:AFTER_FETCH',message:'Fetch response received',data:{status:response.status,statusText:response.statusText,endpoint},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    // 🔴 AUTH HANDLING (NO REDIRECT HERE)
    if (response.status === 401) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiRequest:401',message:'Unauthorized - clearing auth',data:{endpoint},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_EMAIL_KEY);
      throw new Error("AUTH_EXPIRED");
    }

    if (response.status === 204) {
      return null as T;
    }

    const contentType = response.headers.get("content-type");
    const isJson = contentType?.includes("application/json");

    let data: unknown = null;
    if (isJson) {
      const text = await response.text();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiRequest:PARSE_JSON',message:'Parsing JSON response',data:{textLength:text.length,endpoint},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      try {
        data = text ? JSON.parse(text) : null;
      } catch (parseError) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiRequest:JSON_PARSE_ERROR',message:'JSON parse failed',data:{error:String(parseError),textPreview:text.substring(0,100),endpoint},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        throw parseError;
      }
    }

    if (!response.ok) {
      const err = data as { detail?: string; message?: string };
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiRequest:NOT_OK',message:'Response not OK',data:{status:response.status,error:err?.detail||err?.message||'Request failed',endpoint},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      throw new Error(err?.detail || err?.message || "Request failed");
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiRequest:SUCCESS',message:'API request succeeded',data:{endpoint,dataType:typeof data},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return data as T;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiRequest:ERROR',message:'API request error',data:{error:String(error),errorType:error instanceof Error?error.constructor.name:'unknown',endpoint},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    throw error;
  }
}

export const apiGet = <T>(endpoint: string) =>
  apiRequest<T>(endpoint, { method: "GET" });

export const apiPost = <T>(endpoint: string, body?: unknown) =>
  apiRequest<T>(endpoint, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });

export const apiPut = <T>(endpoint: string, body?: unknown) =>
  apiRequest<T>(endpoint, {
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });

export const apiDelete = <T>(endpoint: string) =>
  apiRequest<T>(endpoint, { method: "DELETE" });

/**
 * Upload a file with authentication.
 * Used for audio file uploads and other file uploads.
 */
export async function apiUploadFile(
  endpoint: string,
  file: File,
  additionalData?: Record<string, string>
): Promise<Record<string, unknown>> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiUploadFile:ENTRY',message:'File upload started',data:{endpoint,fileName:file.name,fileSize:file.size},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
  // #endregion
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
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: formData,
    });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiUploadFile:AFTER_FETCH',message:'Upload response received',data:{status:response.status,endpoint},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
    // #endregion

    if (response.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_EMAIL_KEY);
      throw new Error("AUTH_EXPIRED");
    }

    const data = await response.json();

    if (!response.ok) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiUploadFile:ERROR',message:'Upload failed',data:{status:response.status,error:data?.detail||data?.message||'Upload failed',endpoint},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      throw new Error(data.detail || data.message || "Upload failed");
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiUploadFile:SUCCESS',message:'File upload succeeded',data:{endpoint},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    return data;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiUploadFile:EXCEPTION',message:'Upload exception',data:{error:String(error),errorType:error instanceof Error?error.constructor.name:'unknown',endpoint},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    throw error;
  }
}

/**
 * Download a file (returns blob response).
 * Used for PDF/DOCX exports.
 */
export async function apiDownloadFile(endpoint: string): Promise<Response> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiDownloadFile:ENTRY',message:'File download started',data:{endpoint},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  const token = getAuthToken();
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "GET",
      headers,
    });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiDownloadFile:AFTER_FETCH',message:'Download response received',data:{status:response.status,endpoint},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
    // #endregion

    if (response.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_EMAIL_KEY);
      throw new Error("AUTH_EXPIRED");
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiDownloadFile:ERROR',message:'Download failed',data:{status:response.status,error:errorMessage,endpoint},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      throw new Error(errorMessage);
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiDownloadFile:SUCCESS',message:'File download succeeded',data:{endpoint},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    return response;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:apiDownloadFile:EXCEPTION',message:'Download exception',data:{error:String(error),errorType:error instanceof Error?error.constructor.name:'unknown',endpoint},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    throw error;
  }
}
