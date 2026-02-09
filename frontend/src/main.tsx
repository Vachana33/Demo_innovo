import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./contexts/AuthContext";

// #region agent log - Global error handler
window.addEventListener('error', (event) => {
  fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:globalError',message:'Global error caught',data:{message:event.message,filename:event.filename,lineno:event.lineno,colno:event.colno,error:String(event.error)},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
});
window.addEventListener('unhandledrejection', (event) => {
  fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:unhandledRejection',message:'Unhandled promise rejection',data:{reason:String(event.reason)},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
});
// #endregion

// #region agent log
fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:ENTRY',message:'App starting',data:{},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
// #endregion

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:SUCCESS',message:'App rendered successfully',data:{},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
  // #endregion
} catch (error) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:ERROR',message:'App render failed',data:{error:String(error),errorType:error instanceof Error?error.constructor.name:'unknown',errorMessage:error instanceof Error?error.message:'no message',stack:error instanceof Error?error.stack:'no stack'},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  throw error;
}
