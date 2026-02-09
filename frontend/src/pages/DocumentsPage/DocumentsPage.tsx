import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { apiGet } from "../../utils/api";
import { debugLog } from "../../utils/debugLog";
import styles from "./DocumentsPage.module.css";

type Company = {
  id: number;
  name: string;
  website?: string;
};

type FundingProgram = {
  id: number;
  title: string;
};

type DocumentListItem = {
  id: number;
  company_id: number;
  company_name: string;
  funding_program_id?: number;
  funding_program_title?: string;
  type: string;
  updated_at: string;
};

type Document = {
  id: number;
  company_id: number;
  funding_program_id?: number;
  type: string;
  updated_at: string;
  company?: Company;
  funding_program?: FundingProgram;
};

export default function DocumentsPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fundingPrograms, setFundingPrograms] = useState<FundingProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [formTitle, setFormTitle] = useState("");
  const [formCompanyId, setFormCompanyId] = useState<number | null>(null);
  const [formProgramId, setFormProgramId] = useState<number | null>(null);
  const [formTemplate, setFormTemplate] = useState<string>("");

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      // #region agent log
      debugLog("DocumentsPage.tsx:fetchData:ENTRY", "Starting data fetch", {}, "D");
      // #endregion
      try {
        setIsLoading(true);
        // #region agent log
        debugLog("DocumentsPage.tsx:fetchData:BEFORE_API", "About to call APIs", {}, "D");
        // #endregion
        const [documentsData, companiesData, programsData] = await Promise.all([
          apiGet<DocumentListItem[]>("/documents"),
          apiGet<Company[]>("/companies"),
          apiGet<FundingProgram[]>("/funding-programs"),
        ]);
        
        // #region agent log
        debugLog("DocumentsPage.tsx:fetchData:AFTER_API", "API calls completed", { documentsCount: documentsData?.length || 0, companiesCount: companiesData?.length || 0, programsCount: programsData?.length || 0 }, "D");
        // #endregion
        
        // Map DocumentListItem to Document format for display
        const mappedDocuments: Document[] = documentsData.map((doc) => ({
          id: doc.id,
          company_id: doc.company_id,
          funding_program_id: doc.funding_program_id,
          type: doc.type,
          updated_at: doc.updated_at,
          company: {
            id: doc.company_id,
            name: doc.company_name,
          },
          funding_program: doc.funding_program_id && doc.funding_program_title
            ? {
                id: doc.funding_program_id,
                title: doc.funding_program_title,
              }
            : undefined,
        }));
        
        // #region agent log
        debugLog("DocumentsPage.tsx:fetchData:BEFORE_SET_STATE", "About to set state", { mappedCount: mappedDocuments.length }, "D");
        // #endregion
        setDocuments(mappedDocuments);
        setCompanies(companiesData);
        setFundingPrograms(programsData);
        // #region agent log
        debugLog("DocumentsPage.tsx:fetchData:SUCCESS", "Data fetch succeeded", {}, "D");
        // #endregion
      } catch (error: unknown) {
        // #region agent log
        debugLog("DocumentsPage.tsx:fetchData:ERROR", "Data fetch error", { error: String(error), errorType: error instanceof Error ? error.constructor.name : 'unknown', errorMessage: error instanceof Error ? error.message : 'no message' }, "D");
        // #endregion
        console.error("Error fetching data:", error);
        if (error instanceof Error && (error.message.includes("Authentication required") || error.message === "AUTH_EXPIRED")) {
          logout();
        }
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [logout]);

  // Filter documents
  const filteredDocuments = documents.filter((d) => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      d.company?.name.toLowerCase().includes(searchLower) ||
      d.funding_program?.title.toLowerCase().includes(searchLower) ||
      formTitle.toLowerCase().includes(searchLower)
    );
  });

  // Create document draft
  async function handleCreateDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || !formCompanyId) return;

    setIsCreating(true);
    try {
      // Navigate to editor which will create the document
      const docType = "vorhaben"; // Default to vorhabensbeschreibung
      let url = `/editor/${formCompanyId}/${docType}`;
      if (formProgramId) {
        url += `?funding_program_id=${formProgramId}`;
      }
      navigate(url);
    } catch (error: unknown) {
      console.error("Error creating document:", error);
      alert(error instanceof Error ? error.message : "Failed to create document");
      if (error instanceof Error && error.message.includes("Authentication required")) {
        logout();
      }
    } finally {
      setIsCreating(false);
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

  // Get document type display name
  function getDocumentTypeDisplay(type: string) {
    if (type === "vorhabensbeschreibung") return "Vorhabensbeschreibung";
    if (type === "vorkalkulation") return "Vorkalkulation";
    return type;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Documents</h1>
          <p className={styles.subtitle}>
            Manage and generate grant proposals.
          </p>
        </div>
        <button
          onClick={() => {
            setFormTitle("");
            setFormCompanyId(null);
            setFormProgramId(null);
            setFormTemplate("");
            setShowCreateDialog(true);
          }}
          className={styles.newButton}
        >
          + New Document
        </button>
      </header>

      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Search documents..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.documentsList}>
        {isLoading ? (
          <div className={styles.loading}>Loading documents...</div>
        ) : filteredDocuments.length === 0 ? (
          <div className={styles.empty}>
            {documents.length === 0
              ? "No documents found. Create your first document!"
              : `No documents match "${searchTerm}"`}
          </div>
        ) : (
          filteredDocuments.map((doc) => (
            <div key={doc.id} className={styles.documentCard}>
              <div className={styles.cardIcon}>📄</div>
              <div className={styles.cardContent}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>
                    {doc.company?.name || `Document ${doc.id}`}
                  </h3>
                  <div className={styles.cardActions}>
                    <button
                      onClick={() => {
                        const docType = doc.type === "vorhabensbeschreibung" ? "vorhaben" : "vorkalkulation";
                        let url = `/editor/${doc.company_id}/${docType}`;
                        if (doc.funding_program_id) {
                          url += `?funding_program_id=${doc.funding_program_id}`;
                        }
                        navigate(url);
                      }}
                      className={styles.editButton}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className={styles.deleteButton}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                {doc.funding_program && (
                  <p className={styles.cardProgram}>
                    {doc.funding_program.title}
                  </p>
                )}
                <div className={styles.cardMeta}>
                  <span>{getDocumentTypeDisplay(doc.type)}</span>
                  <span>•</span>
                  <span>{formatDate(doc.updated_at)}</span>
                  <span className={styles.draftBadge}>Draft</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Document Dialog */}
      {showCreateDialog && (
        <div
          className={styles.dialogOverlay}
          onClick={() => {
            setShowCreateDialog(false);
            setFormTitle("");
            setFormCompanyId(null);
            setFormProgramId(null);
            setFormTemplate("");
          }}
        >
          <div
            className={styles.dialogBox}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.dialogHeader}>
              <h3 className={styles.dialogTitle}>Create Document Draft</h3>
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setFormTitle("");
                  setFormCompanyId(null);
                  setFormProgramId(null);
                  setFormTemplate("");
                }}
                className={styles.closeButton}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateDraft}>
              <label className={styles.formLabel}>
                Document Title
              </label>
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className={styles.formInput}
                placeholder="e.g. Acme Corp - Innovation Grant"
              />
              <label className={styles.formLabel}>
                Company <span className={styles.required}>*</span>
              </label>
              <select
                value={formCompanyId || ""}
                onChange={(e) => setFormCompanyId(e.target.value ? Number(e.target.value) : null)}
                required
                className={styles.formSelect}
              >
                <option value="">Select company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <label className={styles.formLabel}>
                Funding Program
              </label>
              <select
                value={formProgramId || ""}
                onChange={(e) => setFormProgramId(e.target.value ? Number(e.target.value) : null)}
                className={styles.formSelect}
              >
                <option value="">Select program</option>
                {fundingPrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <label className={styles.formLabel}>
                Template
              </label>
              <select
                value={formTemplate}
                onChange={(e) => setFormTemplate(e.target.value)}
                className={styles.formSelect}
              >
                <option value="">Select template</option>
                <option value="wtt_v1">WTT v1</option>
              </select>
              <div className={styles.dialogActions}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setFormTitle("");
                    setFormCompanyId(null);
                    setFormProgramId(null);
                    setFormTemplate("");
                  }}
                  className={styles.cancelButton}
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={isCreating || !formCompanyId}
                >
                  {isCreating ? "Creating..." : "Create Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
