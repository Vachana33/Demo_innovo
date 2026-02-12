import { useState, useEffect } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { apiGet, apiPost, apiPut, apiDelete, apiUploadFiles } from "../../utils/api";
import styles from "./FundingProgramsPage.module.css";

type FundingProgram = {
  id: number;
  title: string;
  website?: string;
  created_at: string;
};

export default function FundingProgramsPage() {

  const { logout } = useAuth();
  const [programs, setPrograms] = useState<FundingProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formWebsite, setFormWebsite] = useState("");
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [existingDocuments, setExistingDocuments] = useState<Array<{id: string; original_filename: string; file_type: string; file_size: number}>>([]);

  // Fetch programs
  useEffect(() => {
    async function fetchPrograms() {
      try {
        setIsLoading(true);
        const data = await apiGet<FundingProgram[]>("/funding-programs");
        setPrograms(data);
      } catch (error: unknown) {
        console.error("Error fetching funding programs:", error);
        if (error instanceof Error && error.message.includes("Authentication required")) {
          logout();
        }
      } finally {
        setIsLoading(false);
      }
    }
    fetchPrograms();
  }, [logout]);

  // Filter programs
  const filteredPrograms = programs.filter((p) => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      p.title.toLowerCase().includes(searchLower) ||
      (p.website && p.website.toLowerCase().includes(searchLower))
    );
  });

  // Create program
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) return;

    setIsCreating(true);
    try {
      const created = await apiPost<FundingProgram>("/funding-programs", {
        title: formTitle.trim(),
        website: formWebsite.trim() || undefined,
      });
      setPrograms((prev) => [created, ...prev]);
      
      // Upload files if any were selected
      if (formFiles.length > 0) {
        setIsUploading(true);
        try {
          // Filter to only PDF and DOCX files
          const validFiles = formFiles.filter(
            (file) => file.type === "application/pdf" || 
                     file.name.toLowerCase().endsWith(".pdf") ||
                     file.name.toLowerCase().endsWith(".docx") ||
                     file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          );
          
          if (validFiles.length > 0) {
            await apiUploadFiles(`/funding-programs/${created.id}/guidelines/upload`, validFiles);
          }
        } catch (uploadError: unknown) {
          console.error("Error uploading files:", uploadError);
          alert(uploadError instanceof Error ? uploadError.message : "Failed to upload files");
        } finally {
          setIsUploading(false);
        }
      }
      
      setFormTitle("");
      setFormWebsite("");
      setFormFiles([]);
      setShowDialog(false);
    } catch (error: unknown) {
      console.error("Error creating program:", error);
      alert(error instanceof Error ? error.message : "Failed to create program");
      if (error instanceof Error && error.message.includes("Authentication required")) {
        logout();
      }
    } finally {
      setIsCreating(false);
    }
  }

  // Update program
  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !formTitle.trim()) return;

    setIsUpdating(true);
    try {
      const updated = await apiPut<FundingProgram>(`/funding-programs/${editingId}`, {
        title: formTitle.trim(),
        website: formWebsite.trim() || undefined,
      });
      setPrograms((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
      
      // Upload new files if any were selected
      if (formFiles.length > 0) {
        setIsUploading(true);
        try {
          // Filter to only PDF and DOCX files
          const validFiles = formFiles.filter(
            (file) => file.type === "application/pdf" || 
                     file.name.toLowerCase().endsWith(".pdf") ||
                     file.name.toLowerCase().endsWith(".docx") ||
                     file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          );
          
          if (validFiles.length > 0) {
            await apiUploadFiles(`/funding-programs/${editingId}/guidelines/upload`, validFiles);
          }
        } catch (uploadError: unknown) {
          console.error("Error uploading files:", uploadError);
          alert(uploadError instanceof Error ? uploadError.message : "Failed to upload files");
        } finally {
          setIsUploading(false);
        }
      }
      
      setEditingId(null);
      setFormTitle("");
      setFormWebsite("");
      setFormFiles([]);
      setExistingDocuments([]);
      setShowDialog(false);
    } catch (error: unknown) {
      console.error("Error updating program:", error);
      alert(error instanceof Error ? error.message : "Failed to update program");
      if (error instanceof Error && error.message.includes("Authentication required")) {
        logout();
      }
    } finally {
      setIsUpdating(false);
    }
  }

  // Delete program
  async function handleDelete() {
    if (!deletingId) return;

    setIsDeleting(true);
    try {
      await apiDelete(`/funding-programs/${deletingId}`);
      setPrograms((prev) => prev.filter((p) => p.id !== deletingId));
      setDeletingId(null);
    } catch (error: unknown) {
      console.error("Error deleting program:", error);
      alert(error instanceof Error ? error.message : "Failed to delete program");
      if (error instanceof Error && error.message.includes("Authentication required")) {
        logout();
      }
    } finally {
      setIsDeleting(false);
    }
  }

  // Open edit dialog
  async function openEditDialog(program: FundingProgram) {
    setEditingId(program.id);
    setFormTitle(program.title);
    setFormWebsite(program.website || "");
    setFormFiles([]);
    setExistingDocuments([]);
    setOpenMenuId(null);
    setShowDialog(true);
    
    // Fetch existing guidelines documents
    try {
      const response = await apiGet<{documents: Array<{id: string; original_filename: string; file_type: string; file_size: number}>}>(
        `/funding-programs/${program.id}/documents?category=guidelines`
      );
      setExistingDocuments(response.documents || []);
    } catch (error: unknown) {
      console.error("Error fetching documents:", error);
      // Don't show error to user - just continue without documents
    }
  }

  // Format date
  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside() {

      if (openMenuId !== null) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId !== null) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [openMenuId]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Funding Programs</h1>
          <p className={styles.subtitle}>
            Manage grant opportunities and funding sources.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setFormTitle("");
            setFormWebsite("");
            
            setFormFiles([]);
            setShowDialog(true);
          }}
          className={styles.newButton}
        >
          + New Program
        </button>
      </header>

      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Search programs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.programsGrid}>
        {isLoading ? (
          <div className={styles.loading}>Loading programs...</div>
        ) : filteredPrograms.length === 0 ? (
          <div className={styles.empty}>
            {programs.length === 0
              ? "No funding programs found. Create your first program!"
              : `No programs match "${searchTerm}"`}
          </div>
        ) : (
          filteredPrograms.map((program) => (
            <div key={program.id} className={styles.programCard}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{program.title}</h3>
                <p>{formatDate(program.created_at)}</p>

                <div className={styles.cardActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === program.id ? null : program.id);
                    }}
                    className={styles.menuButton}
                    title="More options"
                  >
                    ⋮
                  </button>
                  {openMenuId === program.id && (
                    <div className={styles.menuDropdown}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(program);
                        }}
                        className={styles.menuItem}
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingId(program.id);
                          setOpenMenuId(null);
                        }}
                        className={styles.menuItem}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {program.website && (
                <a
                  href={program.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.visitButton}
                >
                  <span className={styles.visitIcon}>🌐</span>
                  Visit Website
                </a>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Dialog */}
      {showDialog && (
        <div
          className={styles.dialogOverlay}
          onClick={() => {
            setShowDialog(false);
            setEditingId(null);
            setFormTitle("");
            setFormWebsite("");
            setFormFiles([]);
          }}
        >
          <div
            className={styles.dialogBox}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.dialogTitle}>
              {editingId ? "Edit Funding Program" : "New Funding Program"}
            </h3>
            <form onSubmit={editingId ? handleUpdate : handleCreate}>
              <label className={styles.formLabel}>
                Title <span className={styles.required}>*</span>
              </label>
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                required
                className={styles.formInput}
                placeholder="e.g. Green Tech Innovation Grant"
              />
              <label className={styles.formLabel}>Website (optional)</label>
              <input
                value={formWebsite}
                onChange={(e) => setFormWebsite(e.target.value)}
                className={styles.formInput}
                placeholder="https://..."
              />
              <label className={styles.formLabel}>Guidelines Documents (optional)</label>
              {editingId && existingDocuments.length > 0 && (
                <div className={styles.fileList}>
                  <div style={{ marginBottom: "0.5rem", fontWeight: 500 }}>Existing documents:</div>
                  {existingDocuments.map((doc) => (
                    <div key={doc.id} className={styles.fileItem}>
                      📄 {doc.original_filename} ({(doc.file_size / 1024).toFixed(1)} KB)
                    </div>
                  ))}
                </div>
              )}
              <input
                type="file"
                multiple
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setFormFiles(files);
                }}
                className={styles.formInput}
              />
              {formFiles.length > 0 && (
                <div className={styles.fileList}>
                  <div style={{ marginBottom: "0.5rem", fontWeight: 500 }}>New files to upload:</div>
                  {formFiles.map((file, idx) => (
                    <div key={idx} className={styles.fileItem}>
                      📄 {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.dialogActions}>
                <button
                  type="button"
                  onClick={() => {
                    setShowDialog(false);
                    setEditingId(null);
                    setFormTitle("");
                    setFormWebsite("");
                   
                    setFormFiles([]);
                  }}
                  className={styles.cancelButton}
                  disabled={isCreating || isUpdating || isUploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={isCreating || isUpdating || isUploading}
                >
                  {isCreating
                    ? "Creating..."
                    : isUploading
                    ? "Uploading..."
                    : isUpdating
                    ? "Updating..."
                    : editingId
                    ? "Update"
                    : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingId && (
        <div
          className={styles.dialogOverlay}
          onClick={() => setDeletingId(null)}
        >
          <div
            className={styles.dialogBox}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.dialogTitle}>Delete Funding Program</h3>
            <p>Are you sure you want to delete this funding program? This action cannot be undone.</p>
            <div className={styles.dialogActions}>
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className={styles.cancelButton}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className={styles.deleteConfirmButton}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
