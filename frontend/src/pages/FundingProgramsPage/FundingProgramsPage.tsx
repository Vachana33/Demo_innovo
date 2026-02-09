import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { apiGet, apiPost, apiPut, apiDelete } from "../../utils/api";
import styles from "./FundingProgramsPage.module.css";

type FundingProgram = {
  id: number;
  title: string;
  website?: string;
  description?: string;
  created_at: string;
  template_name?: string;
  template_source?: "system" | "user";
  template_ref?: string;
  sections_json?: Array<Record<string, unknown>>;
  content_hash?: string;
  last_scraped_at?: string;
};

export default function FundingProgramsPage() {
  const navigate = useNavigate();
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
  const [scrapingId, setScrapingId] = useState<number | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formWebsite, setFormWebsite] = useState("");

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
      (p.description && p.description.toLowerCase().includes(searchLower)) ||
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
      setFormTitle("");
      setFormWebsite("");
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
      setEditingId(null);
      setFormTitle("");
      setFormWebsite("");
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

  // Refresh program data
  async function handleRefresh(programId: number) {
    try {
      setScrapingId(programId);
      const updated = await apiPost<FundingProgram>(
        `/funding-programs/${programId}/refresh`
      );
      setPrograms((prev) => prev.map((p) => (p.id === programId ? updated : p)));
      alert("Data refreshed successfully!");
    } catch (error: unknown) {
      console.error("Error refreshing program:", error);
      alert(error instanceof Error ? error.message : "Failed to refresh data");
      if (error instanceof Error && error.message.includes("Authentication required")) {
        logout();
      }
    } finally {
      setScrapingId(null);
    }
  }

  // Open edit dialog
  function openEditDialog(program: FundingProgram) {
    setEditingId(program.id);
    setFormTitle(program.title);
    setFormWebsite(program.website || "");
    setShowDialog(true);
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
                <div className={styles.cardActions}>
                  {program.website && (
                    <button
                      onClick={() => handleRefresh(program.id)}
                      className={styles.refreshButton}
                      disabled={scrapingId === program.id}
                      title="Refresh data"
                    >
                      {scrapingId === program.id ? "⏳" : "🔄"}
                    </button>
                  )}
                  <button
                    onClick={() => openEditDialog(program)}
                    className={styles.editButton}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setDeletingId(program.id)}
                    className={styles.deleteButton}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              {program.description && (
                <p className={styles.cardDescription}>{program.description}</p>
              )}
              {program.last_scraped_at && (
                <div className={styles.cardMeta}>
                  <span className={styles.metaIcon}>📅</span>
                  <span>Last updated: {formatDate(program.last_scraped_at)}</span>
                </div>
              )}
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
              <div className={styles.dialogActions}>
                <button
                  type="button"
                  onClick={() => {
                    setShowDialog(false);
                    setEditingId(null);
                    setFormTitle("");
                    setFormWebsite("");
                  }}
                  className={styles.cancelButton}
                  disabled={isCreating || isUpdating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={isCreating || isUpdating}
                >
                  {isCreating
                    ? "Creating..."
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
