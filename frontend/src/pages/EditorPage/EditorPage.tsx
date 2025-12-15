import { useParams } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./EditorPage.module.css";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Section {
  id: string;
  title: string;
  content: string;
}

type AssistantMode = "idle" | "afterHeadings";

export default function EditorPage() {
  const { companyId, docType } = useParams();
  const companyIdNum = companyId ? parseInt(companyId, 10) : null;
  const documentLabel =
    docType === "vorhaben" ? "Vorhabensbeschreibung" : "Vorkalkulation";

  const [companyName, setCompanyName] = useState<string>("Company");
  const [sections, setSections] = useState<Section[]>([]);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("idle");
  const [chatInput, setChatInput] = useState("");
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isInitialLoad = useRef(true);

  const [showExportMenu, setShowExportMenu] = useState(false);

  // Refs for auto-scroll
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load document on mount
  useEffect(() => {
    async function loadDocument() {
      if (!companyIdNum || docType !== "vorhaben") {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetch(
          `${API_BASE_URL}/documents/${companyIdNum}/vorhabensbeschreibung`
        );
        
        if (response.ok) {
          const data = await response.json();
          setDocumentId(data.id);
          
          // Extract sections from content_json
          if (data.content_json && data.content_json.sections) {
            setSections(data.content_json.sections);
            if (data.content_json.sections.length > 0) {
              setAssistantMode("afterHeadings");
            }
          } else {
            setSections([]);
          }
          
          // Mark initial load as complete
          isInitialLoad.current = false;
          
          // Fetch company name
          const companyResponse = await fetch(`${API_BASE_URL}/companies/${companyIdNum}`);
          if (companyResponse.ok) {
            const companyData = await companyResponse.json();
            setCompanyName(companyData.name);
          }
        } else {
          console.error("Failed to load document");
        }
      } catch (error) {
        console.error("Error loading document:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadDocument();
  }, [companyIdNum, docType]);

  // Debounced save function
  const saveDocument = useCallback(async (sectionsToSave: Section[]) => {
    if (!documentId) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSaving(true);
        const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content_json: {
              sections: sectionsToSave,
            },
          }),
        });

        if (!response.ok) {
          console.error("Failed to save document");
        }
      } catch (error) {
        console.error("Error saving document:", error);
      } finally {
        setIsSaving(false);
      }
    }, 1000); // 1 second debounce
  }, [documentId]);

  // Save when sections change (but not on initial load)
  useEffect(() => {
    if (isInitialLoad.current) {
      return; // Don't save on initial load
    }
    if (documentId) {
      saveDocument(sections);
    }
  }, [sections, documentId, saveDocument]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  function handleCreateHeadings() {
    // Placeholder - AI will be implemented later
    const generated: Section[] = [
      { id: "1", title: "1. Projektüberblick", content: "" },
      { id: "1.1", title: "1.1 Unternehmenshintergrund", content: "" },
      { id: "1.2", title: "1.2 Ausgangslage und Ziele", content: "" },
      { id: "2", title: "2. Arbeitspakete", content: "" },
      { id: "2.1", title: "2.1 AP1 – Analyse", content: "" },
      { id: "2.2", title: "2.2 AP2 – Implementierung", content: "" }
    ];
    setSections(generated);
    setAssistantMode("afterHeadings");
    // Document will be saved automatically via useEffect
  }

  function handleClickHeading(id: string) {
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleAssistantModify() {
    alert("Modify headings via AI will be implemented later.");
  }

  function handleAssistantCreateContent() {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        content:
          s.content ||
          "AI content for this section will appear here based on website + transcript."
      }))
    );
  }

  return (
    <div className={styles.editorContainer}>
      {/* LEFT SIDEBAR */}
      <aside className={styles.sidebar}>
        <h2 className={styles.companyName}>{companyName}</h2>
        <p className={styles.documentLabel}>{documentLabel}</p>
        {isSaving && <p style={{ fontSize: "0.8rem", color: "var(--brand-text-medium)", marginBottom: "0.5rem" }}>Saving...</p>}

        <h3 className={styles.headingLabel}>All Headings</h3>

        <div className={styles.headingList}>
          {sections.map((s) => (
            <div
              key={s.id}
              onClick={() => handleClickHeading(s.id)}
              className={styles.headingItem}
            >
              {s.title}
            </div>
          ))}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className={styles.main}>
        {/* TOP TOOLBAR */}
        <header className={styles.toolbar}>
          <button className={styles.undoRedoBtn}>Undo</button>
          <button className={styles.undoRedoBtn}>Redo</button>

          <div className={styles.flexSpacer} />

          {/* EXPORT BUTTON + DROPDOWN */}
          <div className={styles.exportWrapper}>
            <button
              className={styles.exportBtn}
              onClick={() => setShowExportMenu((prev) => !prev)}
            >
              Export ▾
            </button>

            {showExportMenu && (
              <div className={styles.exportMenu}>
                <button className={styles.exportMenuItem}>Download PDF</button>
                <button className={styles.exportMenuItem}>Download DOC</button>
              </div>
            )}
          </div>
        </header>

        <section className={styles.editorArea}>
          {/* Document editor */}
          <div className={styles.documentBox}>
            {isLoading ? (
              <p className={styles.noSectionsMessage}>Loading document...</p>
            ) : sections.length === 0 ? (
              <p className={styles.noSectionsMessage}>
                Click <strong>AI: Create Headings</strong> in the Assistant panel to generate the
                structure. All headings and content will appear here in one
                continuous document.
              </p>
            ) : null}

            {sections.map((s) => (
              <div
                key={s.id}
                ref={(el) => { sectionRefs.current[s.id] = el; }}
                className={styles.sectionBlock}
              >
                <div className={styles.sectionTitle}>{s.title}</div>
                <textarea
                  className={styles.textArea}
                  value={s.content}
                  onChange={(e) =>
                    setSections((prev) =>
                      prev.map((sec) =>
                        sec.id === s.id
                          ? { ...sec, content: e.target.value }
                          : sec
                      )
                    )
                  }
                  placeholder="AI will fill this section, or you can write manually…"
                />
              </div>
            ))}
          </div>

          {/* Assistant panel */}
          <div className={styles.assistantBox}>
            <div className={styles.assistantHeader}>Assistant</div>

            <div className={styles.assistantMessages}>
              {assistantMode === "idle" && (
                <div>
                  <p className={styles.textHint}>
                    Click <strong>AI: Create Headings</strong> to generate the document structure. I'll then
                    help you refine the structure or fill the content.
                  </p>
                  <button
                    onClick={handleCreateHeadings}
                    className={styles.createHeadingsBtn}
                    style={{ marginTop: "1rem" }}
                  >
                    AI: Create Headings
                  </button>
                </div>
              )}

              {assistantMode === "afterHeadings" && (
                <div>
                  <p className={styles.afterHeadingText}>
                    Headings have been created for this document. What would you
                    like to do next?
                  </p>

                  <button
                    onClick={handleAssistantModify}
                    className={styles.modifyBtn}
                  >
                    Modify headings
                  </button>

                  <button
                    onClick={handleAssistantCreateContent}
                    className={styles.fillContentBtn}
                  >
                    Create content for headings
                  </button>
                </div>
              )}
            </div>

            {/* Chat input */}
            <div className={styles.chatInputArea}>
              <button className={styles.plusBtn}>+</button>

              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type instructions e.g. 'remove 2.3'…"
                className={styles.chatInput}
              />

              <button
                className={styles.sendBtn}
                onClick={() => setChatInput("")}
              >
                ⇨
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
