import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { apiGet, apiDelete } from "../../utils/api";
import styles from "./TemplatesPage.module.css";

type SystemTemplate = {
  id: string;
  name: string;
  source: string;
};

type UserTemplate = {
  id: string;
  name: string;
  source: string;
  description?: string;
  template_structure?: {
    sections?: Array<Record<string, unknown>>;
  };
};

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [systemTemplates, setSystemTemplates] = useState<SystemTemplate[]>([]);
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch templates
  useEffect(() => {
    async function fetchTemplates() {
      try {
        setIsLoading(true);
        const [templatesData, userTemplatesData] = await Promise.all([
          apiGet<{ system: SystemTemplate[]; user: UserTemplate[] }>("/templates/list"),
          apiGet<UserTemplate[]>("/user-templates"),
        ]);
        setSystemTemplates(templatesData.system || []);
        setUserTemplates(userTemplatesData || []);
      } catch (error: unknown) {
        console.error("Error fetching templates:", error);
        if (error instanceof Error && error.message.includes("Authentication required")) {
          logout();
        }
      } finally {
        setIsLoading(false);
      }
    }
    fetchTemplates();
  }, [logout]);

  // Filter templates
  const filteredSystemTemplates = systemTemplates.filter((t) => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    return t.name.toLowerCase().includes(searchLower);
  });

  const filteredUserTemplates = userTemplates.filter((t) => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      t.name.toLowerCase().includes(searchLower) ||
      (t.description && t.description.toLowerCase().includes(searchLower))
    );
  });

  // Delete user template
  async function handleDelete() {
    if (!deletingId) return;

    setIsDeleting(true);
    try {
      await apiDelete(`/user-templates/${deletingId}`);
      setUserTemplates((prev) => prev.filter((t) => t.id !== deletingId));
      setDeletingId(null);
    } catch (error: unknown) {
      console.error("Error deleting template:", error);
      alert(error instanceof Error ? error.message : "Failed to delete template");
      if (error instanceof Error && error.message.includes("Authentication required")) {
        logout();
      }
    } finally {
      setIsDeleting(false);
    }
  }

  // Copy template content (placeholder - would need implementation)
  function handleCopyContent(template: SystemTemplate | UserTemplate) {
    // This would copy the template structure to clipboard or show it
    alert(`Template "${template.name}" content would be copied here.`);
  }

  // Get sections preview
  function getSectionsPreview(template: SystemTemplate | UserTemplate): string[] {
    let sections: Array<Record<string, unknown>> = [];
    
    if ("template_structure" in template && template.template_structure) {
      sections = template.template_structure.sections || [];
    } else if ("sections" in template && Array.isArray(template.sections)) {
      sections = template.sections;
    }
    
    if (sections.length > 0) {
      return sections.slice(0, 5).map((s: Record<string, unknown>) => {
        const id = s.id || "";
        const title = s.title || s.name || id;
        return typeof title === "string" ? title : String(id);
      });
    }
    return [];
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Templates</h1>
          <p className={styles.subtitle}>
            Standardized formats for grant applications.
          </p>
        </div>
        <button
          onClick={() => navigate("/templates/new")}
          className={styles.newButton}
        >
          New Template
        </button>
      </header>

      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Search templates..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.templatesGrid}>
        {isLoading ? (
          <div className={styles.loading}>Loading templates...</div>
        ) : (
          <>
            {/* System Templates */}
            {filteredSystemTemplates.map((template) => {
              const sections = getSectionsPreview(template);
              return (
                <div key={template.id} className={styles.templateCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIcon}>📋</div>
                    <div className={styles.cardTitleSection}>
                      <h3 className={styles.cardTitle}>{template.name}</h3>
                      <span className={styles.systemLabel}>System</span>
                    </div>
                  </div>
                  {sections.length > 0 && (
                    <div className={styles.cardSections}>
                      {sections.map((section, idx) => (
                        <div key={idx} className={styles.sectionItem}>
                          {idx + 1}. {section}
                        </div>
                      ))}
                      {sections.length >= 5 && <div className={styles.sectionItem}>...</div>}
                    </div>
                  )}
                  <button
                    onClick={() => handleCopyContent(template)}
                    className={styles.copyButton}
                  >
                    <span className={styles.copyIcon}>📋</span>
                    Copy Content
                  </button>
                </div>
              );
            })}

            {/* User Templates */}
            {filteredUserTemplates.map((template) => {
              const sections = getSectionsPreview(template);
              return (
                <div key={template.id} className={styles.templateCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIcon}>📋</div>
                    <div className={styles.cardTitleSection}>
                      <h3 className={styles.cardTitle}>{template.name}</h3>
                      {template.description && (
                        <p className={styles.cardDescription}>{template.description}</p>
                      )}
                    </div>
                  </div>
                  {sections.length > 0 && (
                    <div className={styles.cardSections}>
                      {sections.map((section, idx) => (
                        <div key={idx} className={styles.sectionItem}>
                          {idx + 1}. {section}
                        </div>
                      ))}
                      {sections.length >= 5 && <div className={styles.sectionItem}>...</div>}
                    </div>
                  )}
                  <div className={styles.cardActions}>
                    <button
                      onClick={() => navigate(`/templates/${template.id}/edit`)}
                      className={styles.editButton}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleCopyContent(template)}
                      className={styles.copyButton}
                    >
                      <span className={styles.copyIcon}>📋</span>
                      Copy Content
                    </button>
                    <button
                      onClick={() => setDeletingId(template.id)}
                      className={styles.deleteButton}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredSystemTemplates.length === 0 && filteredUserTemplates.length === 0 && (
              <div className={styles.empty}>
                {systemTemplates.length === 0 && userTemplates.length === 0
                  ? "No templates found. Create your first template!"
                  : `No templates match "${searchTerm}"`}
              </div>
            )}
          </>
        )}
      </div>

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
            <h3 className={styles.dialogTitle}>Delete Template</h3>
            <p>Are you sure you want to delete this template? This action cannot be undone.</p>
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
