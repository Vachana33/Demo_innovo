import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { apiGet, apiPost, apiPut, apiDelete, apiUploadFile } from "../../utils/api";
import styles from "./CompaniesPage.module.css";

type Company = {
  id: number;
  name: string;
  website?: string;
  audio_path?: string;
  created_at: string;
};

export default function CompaniesPage() {
  const { logout } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formName, setFormName] = useState("");
  const [formWebsite, setFormWebsite] = useState("");
  const [formAudio, setFormAudio] = useState<File | null>(null);

  // Fetch companies
  useEffect(() => {
    async function fetchCompanies() {
      try {
        setIsLoading(true);
        const data = await apiGet<Company[]>("/companies");
        setCompanies(data);
      } catch (error: unknown) {
        console.error("Error fetching companies:", error);
        if (error instanceof Error && error.message.includes("Authentication required")) {
          logout();
        }
      } finally {
        setIsLoading(false);
      }
    }
    fetchCompanies();
  }, [logout]);

  // Filter companies
  const filteredCompanies = companies.filter((c) => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(searchLower) ||
      (c.website && c.website.toLowerCase().includes(searchLower))
    );
  });

  // Create company
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;

    setIsCreating(true);
    try {
      let audioPath: string | undefined = undefined;
      if (formAudio) {
        const uploadData = await apiUploadFile("/upload-audio", formAudio) as { audio_path?: string };
        audioPath = uploadData.audio_path;
      }

      const created = await apiPost<Company>("/companies", {
        name: formName.trim(),
        website: formWebsite.trim() || undefined,
        audio_path: audioPath,
      });
      setCompanies((prev) => [created, ...prev]);
      setFormName("");
      setFormWebsite("");
      setFormAudio(null);
      setShowDialog(false);
    } catch (error: unknown) {
      console.error("Error creating company:", error);
      alert(error instanceof Error ? error.message : "Failed to create company");
      if (error instanceof Error && error.message.includes("Authentication required")) {
        logout();
      }
    } finally {
      setIsCreating(false);
    }
  }

  // Update company
  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !formName.trim()) return;

    setIsUpdating(true);
    try {
      let audioPath: string | undefined = undefined;
      if (formAudio) {
        const uploadData = await apiUploadFile("/upload-audio", formAudio) as { audio_path?: string };
        audioPath = uploadData.audio_path;
      }

      const updated = await apiPut<Company>(`/companies/${editingId}`, {
        name: formName.trim(),
        website: formWebsite.trim() || undefined,
        audio_path: audioPath,
      });
      setCompanies((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      setEditingId(null);
      setFormName("");
      setFormWebsite("");
      setFormAudio(null);
      setShowDialog(false);
    } catch (error: unknown) {
      console.error("Error updating company:", error);
      alert(error instanceof Error ? error.message : "Failed to update company");
      if (error instanceof Error && error.message.includes("Authentication required")) {
        logout();
      }
    } finally {
      setIsUpdating(false);
    }
  }

  // Delete company
  async function handleDelete() {
    if (!deletingId) return;

    setIsDeleting(true);
    try {
      await apiDelete(`/companies/${deletingId}`);
      setCompanies((prev) => prev.filter((c) => c.id !== deletingId));
      setDeletingId(null);
    } catch (error: unknown) {
      console.error("Error deleting company:", error);
      alert(error instanceof Error ? error.message : "Failed to delete company");
      if (error instanceof Error && error.message.includes("Authentication required")) {
        logout();
      }
    } finally {
      setIsDeleting(false);
    }
  }

  // Open edit dialog
  function openEditDialog(company: Company) {
    setEditingId(company.id);
    setFormName(company.name);
    setFormWebsite(company.website || "");
    setFormAudio(null);
    setShowDialog(true);
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Companies</h1>
          <p className={styles.subtitle}>
            Manage company profiles and information.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setFormName("");
            setFormWebsite("");
            setFormAudio(null);
            setShowDialog(true);
          }}
          className={styles.newButton}
        >
          + New Company
        </button>
      </header>

      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Search companies..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.companiesGrid}>
        {isLoading ? (
          <div className={styles.loading}>Loading companies...</div>
        ) : filteredCompanies.length === 0 ? (
          <div className={styles.empty}>
            {companies.length === 0
              ? "No companies found. Create your first company!"
              : `No companies match "${searchTerm}"`}
          </div>
        ) : (
          filteredCompanies.map((company) => (
            <div key={company.id} className={styles.companyCard}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{company.name}</h3>
                <div className={styles.cardActions}>
                  <button
                    onClick={() => openEditDialog(company)}
                    className={styles.editButton}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setDeletingId(company.id)}
                    className={styles.deleteButton}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              {company.website && (
                <p className={styles.cardWebsite}>{company.website}</p>
              )}
              {company.audio_path && (
                <div className={styles.cardMeta}>
                  <span className={styles.metaIcon}>🎙️</span>
                  <span>Audio file attached</span>
                </div>
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
            setFormName("");
            setFormWebsite("");
            setFormAudio(null);
          }}
        >
          <div
            className={styles.dialogBox}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.dialogTitle}>
              {editingId ? "Edit Company" : "New Company"}
            </h3>
            <form onSubmit={editingId ? handleUpdate : handleCreate}>
              <label className={styles.formLabel}>
                Company Name <span className={styles.required}>*</span>
              </label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className={styles.formInput}
                placeholder="e.g. Acme Corporation"
              />
              <label className={styles.formLabel}>Website (optional)</label>
              <input
                value={formWebsite}
                onChange={(e) => setFormWebsite(e.target.value)}
                className={styles.formInput}
                placeholder="https://..."
              />
              <label className={styles.formLabel}>Meeting Audio (optional)</label>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setFormAudio(e.target.files?.[0] ?? null)}
                className={styles.formFile}
              />
              <div className={styles.dialogActions}>
                <button
                  type="button"
                  onClick={() => {
                    setShowDialog(false);
                    setEditingId(null);
                    setFormName("");
                    setFormWebsite("");
                    setFormAudio(null);
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
            <h3 className={styles.dialogTitle}>Delete Company</h3>
            <p>Are you sure you want to delete this company? This action cannot be undone.</p>
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
