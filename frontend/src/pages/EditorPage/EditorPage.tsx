import { useParams } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { apiGet, apiPut, apiPost, apiDownloadFile } from "../../utils/api";
import styles from "./EditorPage.module.css";

interface Section {
  id: string;
  title: string;
  content: string;
}

type EditorMode = "reviewHeadings" | "confirmedHeadings" | "editingContent";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  suggestedContent?: Record<string, string>; // section_id -> suggested_content
  requiresConfirmation?: boolean;
  messageId?: string; // For tracking which message needs confirmation
}

export default function EditorPage() {
  const { companyId, docType } = useParams();
  const { logout } = useAuth();
  const companyIdNum = companyId ? parseInt(companyId, 10) : null;
  const documentLabel =
    docType === "vorhaben" ? "Vorhabensbeschreibung" : "Vorkalkulation";

  const [companyName, setCompanyName] = useState<string>("Company");
  const [sections, setSections] = useState<Section[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [lastEditedSections, setLastEditedSections] = useState<string[]>([]); // Track last edited sections for context
  const isInitialLoad = useRef(true);
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const isUpdatingFromChat = useRef(false); // Flag to prevent auto-save race condition after chat updates
  const previousSectionsRef = useRef<Section[]>([]); // Track previous sections for undo/redo history
  
  // Preview state management
  const [previewContent, setPreviewContent] = useState<Record<string, string> | null>(null);
  const [previewSectionIds, setPreviewSectionIds] = useState<string[]>([]);

  const [showExportMenu, setShowExportMenu] = useState(false);

  // Undo/Redo history stack
  // past: array of previous section states
  // present: current section state
  // future: array of future states (for redo)
  const [historyPast, setHistoryPast] = useState<Section[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<Section[][]>([]);
  const canUndo = historyPast.length > 0;
  const canRedo = historyFuture.length > 0;

  // Company processing readiness state
  // These states drive UI visibility and button enabled/disabled states
  // isContentReady: true only when company.processing_status === "done"
  // isCheckingReadiness: true while polling for processing completion
  const [companyProcessingStatus, setCompanyProcessingStatus] = useState<string | null>(null);
  const [isCheckingReadiness, setIsCheckingReadiness] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Computed readiness state - content generation is only safe when processing is done
  const isContentReady = companyProcessingStatus === "done";

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
        const data = await apiGet<any>(
          `/documents/${companyIdNum}/vorhabensbeschreibung`
        );
        setDocumentId(data.id);
        
        // Extract sections from content_json
        let loadedSections: Section[] = [];
        if (data.content_json && data.content_json.sections) {
          loadedSections = data.content_json.sections;
          setSections(loadedSections);
          // Determine mode: if sections have content, we're in editingContent mode, otherwise reviewHeadings mode
          if (loadedSections.length > 0) {
            const hasContent = loadedSections.some((s: Section) => s.content && s.content.trim() !== "");
            setEditorMode(hasContent ? "editingContent" : "reviewHeadings");
          } else {
            setEditorMode(null);
          }
        } else {
          setSections([]);
          setEditorMode(null);
        }
        
        // Load chat history if available
        if (data.chat_history && Array.isArray(data.chat_history)) {
          if (data.chat_history.length > 0) {
            const loadedMessages: ChatMessage[] = data.chat_history.map((msg: any) => ({
              role: msg.role as "user" | "assistant",
              text: msg.text,
              suggestedContent: msg.suggestedContent,
              requiresConfirmation: msg.requiresConfirmation,
              messageId: msg.messageId
            }));
            setChatMessages(loadedMessages);
            console.log(`Loaded ${loadedMessages.length} chat messages from history`);
          } else {
            // Explicitly set to empty array if chat_history exists but is empty
            setChatMessages([]);
            console.log("Chat history exists but is empty");
          }
        } else {
          // No chat_history field - initialize empty
          setChatMessages([]);
          console.log("No chat history found in document");
        }
        
        // Mark initial load as complete
        isInitialLoad.current = false;
        
        // Initialize undo/redo history with loaded sections
        if (loadedSections.length > 0) {
          setHistoryPast([loadedSections.map(s => ({ ...s }))]);
          setHistoryFuture([]);
        }
        
        // Fetch company data including processing status
        const companyData = await apiGet<any>(`/companies/${companyIdNum}`);
        setCompanyName(companyData.name);
        setCompanyProcessingStatus(companyData.processing_status || "pending");
      } catch (error: any) {
        console.error("Error loading document:", error);
        if (error.message.includes("Authentication required")) {
          logout();
        }
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
        await apiPut(`/documents/${documentId}`, {
          content_json: {
            sections: sectionsToSave,
          },
        });
      } catch (error: any) {
        console.error("Error saving document:", error);
        if (error.message.includes("Authentication required")) {
          logout();
        }
      } finally {
        setIsSaving(false);
      }
    }, 1000); // 1 second debounce
  }, [documentId]);

  // Track section changes for undo/redo history
  // Save history when sections change (but not on initial load)
  useEffect(() => {
    if (isInitialLoad.current) {
      // Store initial state in ref
      previousSectionsRef.current = sections.map(s => ({ ...s }));
      return; // Don't track history on initial load
    }
    
    // When sections change, push PREVIOUS state to history (not current state)
    // Clear future stack (new edit invalidates redo)
    if (sections.length > 0) {
      // Get the previous state from ref
      const previousState = previousSectionsRef.current;
      
      // Only track if there's a meaningful change
      // This prevents tracking every keystroke, but tracks meaningful edits
      const timeoutId = setTimeout(() => {
        // Check if current state is different from previous state
        const isDifferent = JSON.stringify(previousState) !== JSON.stringify(sections);
        
        if (isDifferent && previousState.length > 0) {
          setHistoryPast((prev) => {
            // Avoid duplicate consecutive states
            if (prev.length > 0) {
              const lastState = prev[prev.length - 1];
              const isDuplicate = JSON.stringify(lastState) === JSON.stringify(previousState);
              if (isDuplicate) return prev;
            }
            // Save the PREVIOUS state (before the change)
            return [...prev, previousState.map(s => ({ ...s }))];
          });
          setHistoryFuture([]); // Clear future on new edit
        }
        
        // Update ref to current state for next change
        previousSectionsRef.current = sections.map(s => ({ ...s }));
      }, 500); // Debounce to avoid too many history entries
      
      return () => clearTimeout(timeoutId);
    }
  }, [sections]);

  // Save when sections change (but not on initial load or after chat updates)
  useEffect(() => {
    if (isInitialLoad.current) {
      return; // Don't save on initial load
    }
    if (isUpdatingFromChat.current) {
      // Skip auto-save when updating from chat response (prevents race condition)
      isUpdatingFromChat.current = false;
      return;
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

  // Scroll chat to bottom when new messages are added
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        chatMessagesEndRef.current?.scrollIntoView({ 
          behavior: "smooth",
          block: "end"
        });
      }, 100);
    }
  }, [chatMessages, isChatLoading]); // Add isChatLoading to dependencies

  /**
   * When editor mode changes to confirmedHeadings, check if company processing is needed.
   * If processing is not complete, automatically start polling.
   * This ensures readiness is checked as soon as headings are confirmed.
   */
  useEffect(() => {
    if (editorMode === "confirmedHeadings" && companyIdNum && !isCheckingReadiness) {
      // Check current status
      checkCompanyProcessingStatus().then((status) => {
        // If not ready, start polling
        if (status !== "done" && status !== "failed") {
          startProcessingStatusPoll();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorMode, companyIdNum]);

  // Convert JSON template to numbered sections
  function generateSectionsFromTemplate(template: any): Section[] {
    const sections: Section[] = [];
    const parentCounters: Record<string, number> = {};
    
    // Extract the Vorhabensbeschreibung object
    const vorhaben = template.Vorhabensbeschreibung || template;
    
    function processNode(key: string, value: any, parentId: string = ""): void {
      // Skip arrays (they're placeholders, not sections)
      if (Array.isArray(value)) {
        return;
      }
      
      // Extract section number from key (e.g., "1_Angaben_zum_Unternehmen" -> "1")
      const numberMatch = key.match(/^(\d+)_/);
      let sectionNumber: string = "";
      let title: string = "";
      let shouldCreateSection = true;
      
      if (numberMatch) {
        // Key starts with number (main section like "1_Angaben_zum_Unternehmen")
        sectionNumber = numberMatch[1];
        title = key.replace(/^\d+_/, "").replace(/_/g, " ");
      } else if (key === "Titelblock") {
        // Special case: Titelblock is section 0
        sectionNumber = "0";
        title = "Titelblock";
      } else if (typeof value === "object" && value !== null) {
        // Nested object without number prefix (like "SWOT_Analyse")
        // This becomes a subsection
        const counter = (parentCounters[parentId] || 0) + 1;
        parentCounters[parentId] = counter;
        sectionNumber = counter.toString();
        title = key.replace(/_/g, " ");
      } else if (typeof value === "string") {
        // String field (like "Firmengeschichte") - becomes a subsection
        const counter = (parentCounters[parentId] || 0) + 1;
        parentCounters[parentId] = counter;
        sectionNumber = counter.toString();
        title = key.replace(/_/g, " ");
      } else {
        shouldCreateSection = false;
      }
      
      if (shouldCreateSection && sectionNumber && title) {
        const fullId = parentId ? `${parentId}.${sectionNumber}` : sectionNumber;
        
        // Create section
        sections.push({
          id: fullId,
          title: `${fullId}. ${title}`,
          content: ""
        });
        
        // Initialize counter for this section
        parentCounters[fullId] = 0;
        
        // Process nested objects (but not arrays or strings)
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          Object.keys(value).forEach(subKey => {
            processNode(subKey, value[subKey], fullId);
          });
        }
      }
    }
    
    // Sort keys to process in order (Titelblock first, then numbered sections)
    const sortedKeys = Object.keys(vorhaben).sort((a, b) => {
      // Titelblock comes first
      if (a === "Titelblock") return -1;
      if (b === "Titelblock") return 1;
      
      // Extract numbers for comparison
      const aMatch = a.match(/^(\d+)_/);
      const bMatch = b.match(/^(\d+)_/);
      
      if (aMatch && bMatch) {
        return parseInt(aMatch[1]) - parseInt(bMatch[1]);
      }
      return a.localeCompare(b);
    });
    
    // Process all top-level keys in order
    sortedKeys.forEach(key => {
      processNode(key, vorhaben[key]);
    });
    
    return sections;
  }

  function handleCreateHeadings() {
    // Full Vorhabensbeschreibung template
    const template = {
      "Vorhabensbeschreibung": {
        "Titelblock": {
          "Projekttitel": "",
          "Aktenzeichen_oder_Anlage": "",
          "Foerderprogramm": "",
          "Projekttraeger": "",
          "Datum": ""
        },
        "1_Angaben_zum_Unternehmen": {
          "Firmengeschichte": "",
          "Unternehmensprofil": "",
          "Branche_und_Leistungsangebot": "",
          "Standort": "",
          "Team_und_Personalstruktur": "",
          "Zertifizierungen_und_Qualitaetsstandards": "",
          "Technologische_Ausgangslage": "",
          "SWOT_Analyse": {
            "Strengths": "",
            "Weaknesses": "",
            "Opportunities": "",
            "Threats": ""
          }
        },
        "2_Ausgangssituation_und_Problemstellung": {
          "Ausgangssituation": "",
          "Problemstellung": "",
          "Markt_und_Wettbewerbssituation": "",
          "Stand_der_Technik": "",
          "Schutzrechte_und_Patentanalyse": "",
          "Benchmarking_und_Vergleichsanalysen": "",
          "Relevante_Regulatorische_Rahmenbedingungen": "",
          "Warum_Handlungsbedarf_besteht": ""
        },
        "3_Ziele_des_Vorhabens": {
          "Gesamtziel": "",
          "Technologische_Ziele": "",
          "Wirtschaftliche_Ziele": "",
          "Innovationsgehalt_und_Neuheitsgrad": "",
          "Nutzen_und_Mehrwert_fuer_Kunden_und_Markt": "",
          "Strategische_Relevanz_fuer_das_Unternehmen": ""
        },
        "4_Projektbeschreibung_und_Technischer_Loesungsansatz": {
          "Projektbeschreibung": "",
          "Technischer_Loesungsansatz": "",
          "Technologie_und_Systemuebersicht": "",
          "Hardwarekonzept": "",
          "Softwarekonzept": "",
          "Schnittstellen_und_Integration": "",
          "Konstruktionsgrundsaetze_und_Designvorgaben": "",
          "Simulations_und_Berechnungsansaetze": "",
          "Lastenheft_und_Anforderungskatalog": ""
        },
        "5_Innovationsbeschreibung": {
          "Beschreibung_der_Innovation": "",
          "Abgrenzung_zum_Stand_der_Technik": "",
          "Wissenschaftliche_und_Technische_Neuheit": "",
          "Potenzielle_Schutzfaehigkeit": "",
          "Uebertragbarkeit_und_Modularitaet": ""
        },
        "6_Arbeitspakete": {
          "Uebersicht_aller_APs": "",
          "APs": [{}]
        },
        "7_Projektkalkulation": {
          "Gesamtkosten": "",
          "Geplanter_Beratungsumfang": "",
          "Material_und_Entwicklungskosten": "",
          "Externe_Dienstleistungen": "",
          "Investitionsbedarf": ""
        },
        "8_Zeit_und_Meilensteinplanung": {
          "Gesamtprojektlaufzeit": "",
          "Projektphasen": "",
          "Meilensteine": [],
          "Abhaengigkeiten_zwischen_APs": ""
        },
        "9_Vernetzung_und_Wertschoepfungskette": {
          "Kooperationen": "",
          "Technologie_und_Wissenstransfer": "",
          "Einbettung_in_die_Wertschoepfungskette": ""
        },
        "10_Risikoanalyse": {
          "Technische_Risiken": "",
          "Wirtschaftliche_Risiken": "",
          "Regulatorische_Risiken": "",
          "Massnahmen_zur_Risikominimierung": ""
        },
        "11_Notwendigkeit_des_WTT_Vorhabens": {
          "Begruendung_der_Notwendigkeit": "",
          "Warum_ohne_Foerderung_nicht_realiserbar": ""
        },
        "12_Ergebnisverwertung_und_Nutzen": {
          "Technischer_Nutzen": "",
          "Wirtschaftlicher_Nutzen": "",
          "Verwertungskonzept": ""
        },
        "13_Regulatorische_und_Qualitaetsanforderungen": {
          "Normen_und_Standards": "",
          "Dokumentationspflichten": ""
        },
        "14_Anhang": {
          "Technische_Zeichnungen": "",
          "Simulationen": "",
          "Weitere_Unterlagen": ""
        }
      }
    };
    
    const generated = generateSectionsFromTemplate(template);
    setSections(generated);
    setEditorMode("reviewHeadings");
    // Document will be saved automatically via useEffect
  }

  /**
   * Check company processing status by fetching latest company data.
   * Returns the current processing_status from backend.
   */
  async function checkCompanyProcessingStatus(): Promise<string> {
    if (!companyIdNum) return "pending";
    
    try {
      const companyData = await apiGet<any>(`/companies/${companyIdNum}`);
      const status = companyData.processing_status || "pending";
      setCompanyProcessingStatus(status);
      return status;
    } catch (error: any) {
      console.error("Error checking company processing status:", error);
      return companyProcessingStatus || "pending";
    }
  }

  /**
   * Poll company processing status until it's "done" or "failed".
   * Stops polling when status reaches a terminal state.
   */
  function startProcessingStatusPoll() {
    if (!companyIdNum) return;
    
    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    setIsCheckingReadiness(true);
    
    // Poll every 2 seconds to check processing status
    // This allows user to see progress without overwhelming the backend
    pollingIntervalRef.current = setInterval(async () => {
      const status = await checkCompanyProcessingStatus();
      
      // Stop polling when processing is complete (done or failed)
      if (status === "done" || status === "failed") {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsCheckingReadiness(false);
      }
    }, 2000);
    
    // Also check immediately
    checkCompanyProcessingStatus();
  }

  /**
   * Cleanup polling interval on unmount or when component updates
   */
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  /**
   * When user confirms headings, check company processing status.
   * If not ready, start polling until processing is complete.
   * This ensures content generation button only appears when safe.
   */
  async function handleConfirmHeadings() {
    setEditorMode("confirmedHeadings");
    // Document will be saved automatically via useEffect
    
    // Check current processing status
    const currentStatus = await checkCompanyProcessingStatus();
    
    // If processing is not complete, start polling
    // This handles cases where:
    // - Company was just created and processing is still running
    // - Processing is in "pending" or "processing" state
    if (currentStatus !== "done" && currentStatus !== "failed") {
      startProcessingStatusPoll();
    }
  }

  function handleDeleteHeading(id: string) {
    // Remove the section
    let updatedSections = sections.filter(s => s.id !== id);
    
    // Also remove any child sections
    updatedSections = updatedSections.filter(s => !s.id.startsWith(id + "."));
    
    // Renumber remaining sections
    updatedSections = renumberSections(updatedSections);
    
    setSections(updatedSections);
    // Document will be saved automatically via useEffect
  }

  function handleClickHeading(id: string) {
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /**
   * Undo handler - restores previous state from history
   */
  function handleUndo() {
    if (!canUndo || historyPast.length === 0) return;
    
    // Save current state to ref before changing (for history tracking)
    previousSectionsRef.current = sections.map(s => ({ ...s }));
    
    // Move current state to future (for redo)
    setHistoryFuture((prev) => [sections.map(s => ({ ...s })), ...prev]);
    
    // Pop last state from past and set as current
    const previousState = historyPast[historyPast.length - 1];
    setHistoryPast((prev) => prev.slice(0, -1));
    
    // Update sections state - this will trigger the history tracking useEffect
    // but we've already saved current state to ref, so it won't interfere
    const restoredState = previousState.map(s => ({ ...s }));
    setSections(restoredState);
    
    // Update ref to match restored state
    previousSectionsRef.current = restoredState;
  }

  /**
   * Redo handler - restores next state from future
   */
  function handleRedo() {
    if (!canRedo || historyFuture.length === 0) return;
    
    // Save current state to ref before changing (for history tracking)
    previousSectionsRef.current = sections.map(s => ({ ...s }));
    
    // Move current state to past (for undo)
    setHistoryPast((prev) => [...prev, sections.map(s => ({ ...s }))]);
    
    // Pop first state from future and set as current
    const nextState = historyFuture[0];
    setHistoryFuture((prev) => prev.slice(1));
    
    // Update sections state - this will trigger the history tracking useEffect
    // but we've already saved current state to ref, so it won't interfere
    const restoredState = nextState.map(s => ({ ...s }));
    setSections(restoredState);
    
    // Update ref to match restored state
    previousSectionsRef.current = restoredState;
  }

  // Parse section IDs from command (e.g., "remove 5.2 and 5.3" or "remove 2.3")
  function parseRemoveCommand(command: string): string[] {
    const lowerCommand = command.toLowerCase();
    const removePattern = /remove\s+([\d.]+(?:\s+and\s+[\d.]+)*)/i;
    const match = lowerCommand.match(removePattern);
    
    if (!match) return [];
    
    const idsString = match[1];
    // Split by "and" or comma, then trim
    const ids = idsString.split(/\s+and\s+|\s*,\s*/).map(id => id.trim());
    return ids;
  }

  // Renumber sections after removal
  function renumberSections(sections: Section[]): Section[] {
    if (sections.length === 0) return [];
    
    // Sort sections by their current ID to maintain order
    const sorted = [...sections].sort((a, b) => {
      const aParts = a.id.split('.').map(Number);
      const bParts = b.id.split('.').map(Number);
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] || 0;
        const bVal = bParts[i] || 0;
        if (aVal !== bVal) return aVal - bVal;
      }
      return 0;
    });
    
    const renumbered: Section[] = [];
    const parentCounters: Record<string, number> = {};
    const idMapping: Record<string, string> = {}; // Map old IDs to new IDs
    
    sorted.forEach(section => {
      const parts = section.id.split('.');
      const level = parts.length;
      
      if (level === 1) {
        // Top-level section
        const counter = (parentCounters[''] || 0) + 1;
        parentCounters[''] = counter;
        const newId = counter.toString();
        const titleWithoutNumber = section.title.replace(/^\d+\.\s*/, '');
        renumbered.push({
          id: newId,
          title: `${newId}. ${titleWithoutNumber}`,
          content: section.content
        });
        parentCounters[newId] = 0;
        idMapping[section.id] = newId;
      } else {
        // Subsection - find parent's new ID using mapping
        const oldParentId = parts.slice(0, -1).join('.');
        const newParentId = idMapping[oldParentId];
        
        if (newParentId) {
          const counter = (parentCounters[newParentId] || 0) + 1;
          parentCounters[newParentId] = counter;
          const newId = `${newParentId}.${counter}`;
          const titleWithoutNumber = section.title.replace(/^[\d.]+\.\s*/, '');
          renumbered.push({
            id: newId,
            title: `${newId}. ${titleWithoutNumber}`,
            content: section.content
          });
          parentCounters[newId] = 0;
          idMapping[section.id] = newId;
        }
      }
    });
    
    return renumbered;
  }

  // Clear preview
  function clearPreview() {
    setPreviewContent(null);
    setPreviewSectionIds([]);
  }

  // Handle approve edit - apply confirmed changes
  async function handleApproveEdit(_messageId: string, suggestedContent: Record<string, string>) {
    if (!documentId) {
      console.error("Cannot approve edit: documentId is missing");
      setChatMessages(prev => [...prev, {
        role: "assistant",
        text: "Fehler: Dokument-ID fehlt. Bitte aktualisieren Sie die Seite."
      }]);
      return;
    }
    
    if (!suggestedContent || Object.keys(suggestedContent).length === 0) {
      console.error("Cannot approve edit: suggestedContent is empty or missing");
      setChatMessages(prev => [...prev, {
        role: "assistant",
        text: "Fehler: Keine Vorschau-Inhalte gefunden. Bitte versuchen Sie es erneut."
      }]);
      return;
    }
    
    console.log(`Approving edit for ${Object.keys(suggestedContent).length} section(s):`, Object.keys(suggestedContent));
    console.log("Suggested content:", suggestedContent);
    
    // NEW: Validate that suggestedContent doesn't contain user question text
    const recentUserMessages = chatMessages
      .filter(msg => msg.role === "user")
      .slice(-5) // Check last 5 user messages
      .map(msg => msg.text.trim().toLowerCase());
    
    try {
      setIsChatLoading(true);
      
      // Call confirmation endpoint for each section
      const updatedSectionIds: string[] = [];
      const errors: string[] = [];
      
      for (const [sectionId, content] of Object.entries(suggestedContent)) {
        try {
          if (!sectionId || !content) {
            console.error(`Invalid section data: sectionId=${sectionId}, content=${content ? 'exists' : 'missing'}`);
            errors.push(`Section ${sectionId}: Invalid data`);
            continue;
          }
          
          // Ensure content is a string
          const contentStr = typeof content === 'string' ? content : String(content);
          if (!contentStr || contentStr.trim().length === 0) {
            console.error(`Section ${sectionId}: Content is empty`);
            errors.push(`Section ${sectionId}: Content is empty`);
            continue;
          }
          
          // NEW: Enhanced logging
          console.log(`=== Approving edit for section ${sectionId} ===`);
          console.log(`Content length: ${contentStr.length}`);
          console.log(`Content preview (first 200 chars): ${contentStr.substring(0, 200)}...`);
          const lastUserMessage = chatMessages.filter(m => m.role === "user").slice(-1)[0]?.text || "N/A";
          console.log(`Last user message: ${lastUserMessage}`);
          
          // NEW: Validate that suggestedContent doesn't contain user question text
          const contentLower = contentStr.trim().toLowerCase();
          
          // Check if content matches any recent user message
          if (recentUserMessages.some(userMsg => contentLower === userMsg || contentLower.includes(userMsg))) {
            console.error(`ERROR: Suggested content for section ${sectionId} appears to be user question text!`);
            console.error(`User message matched: ${recentUserMessages.find(userMsg => contentLower === userMsg || contentLower.includes(userMsg))}`);
            console.error(`Content that matched: ${contentStr.substring(0, 200)}...`);
            errors.push(`Section ${sectionId}: Content validation failed - appears to be user question text`);
            continue;
          }
          
          // Verify content doesn't match user message
          if (lastUserMessage !== "N/A" && contentStr.trim().toLowerCase() === lastUserMessage.trim().toLowerCase()) {
            console.error(`CRITICAL ERROR: Content matches user message! This should not happen.`);
            errors.push(`Section ${sectionId}: Content validation failed - matches user question`);
            continue;
          }
          
          // Validate content length (AI-generated content should be substantial)
          if (contentStr.trim().length < 50) {
            console.warn(`Warning: Suggested content for section ${sectionId} is very short (${contentStr.trim().length} chars). This might be an error.`);
            // Don't block it, but log a warning
          }
          
          console.log(`Confirming edit for section ${sectionId}, content length: ${contentStr.length}`);
          console.log(`Content preview: ${contentStr.substring(0, 100)}...`);
          
          const response = await apiPost(`/documents/${documentId}/chat/confirm`, {
            section_id: sectionId,
            confirmed_content: contentStr
          });
          
          console.log(`Successfully confirmed edit for section ${sectionId}:`, response);
          updatedSectionIds.push(sectionId);
        } catch (error: any) {
          const errorMsg = error.message || error.toString() || "Unknown error";
          console.error(`Failed to confirm edit for section ${sectionId}:`, error);
          console.error(`Error details:`, errorMsg);
          errors.push(`Section ${sectionId}: ${errorMsg}`);
          // Continue with other sections even if one fails
        }
      }
      
      if (updatedSectionIds.length === 0) {
        const errorMessage = errors.length > 0 
          ? `Fehler beim Speichern der Änderungen: ${errors.join('; ')}`
          : "Fehler beim Speichern der Änderungen. Bitte versuchen Sie es erneut.";
        setChatMessages(prev => [...prev, {
          role: "assistant",
          text: errorMessage
        }]);
        return;
      }
      
      // Log if some sections failed
      if (errors.length > 0) {
        console.warn(`Some sections failed to save: ${errors.join('; ')}`);
      }
      
      // Wait a brief moment to ensure backend save is complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Fetch updated document
      try {
        console.log(`Fetching updated document after confirming ${updatedSectionIds.length} section(s)`);
        const updatedDocument = await apiGet<any>(
          `/documents/${companyIdNum}/vorhabensbeschreibung`
        );
        
        if (updatedDocument.content_json && updatedDocument.content_json.sections) {
          // Verify the sections were actually updated
          const updatedSections = updatedDocument.content_json.sections as Section[];
          let allSectionsUpdated = true;
          
          for (const sectionId of updatedSectionIds) {
            const updatedSection = updatedSections.find(s => s.id === sectionId);
            const originalSection = sections.find(s => s.id === sectionId);
            const expectedContent = suggestedContent[sectionId];
            
            if (!updatedSection) {
              console.error(`Section ${sectionId} not found in updated document!`);
              allSectionsUpdated = false;
            } else if (updatedSection.content !== expectedContent) {
              console.warn(`Section ${sectionId} content mismatch! Expected length: ${expectedContent.length}, Got: ${updatedSection.content.length}`);
              console.warn(`Expected preview: ${expectedContent.substring(0, 100)}...`);
              console.warn(`Got preview: ${updatedSection.content.substring(0, 100)}...`);
              allSectionsUpdated = false;
            } else {
              console.log(`✓ Section ${sectionId} successfully updated (length: ${updatedSection.content.length})`);
            }
          }
          
          if (!allSectionsUpdated) {
            console.error("Some sections were not updated correctly!");
          }
          
          // Set flag to prevent auto-save from overwriting confirmed updates
          isUpdatingFromChat.current = true;
          
          // Update sections state (this will trigger history tracking for undo/redo)
          // History tracking only happens when sections state changes, not for previews
          setSections(updatedSections);
          
          // Clear preview
          clearPreview();
          
          // Add confirmation message to chat
          const confirmMessage = updatedSectionIds.length === 1
            ? `Änderung für Abschnitt ${updatedSectionIds[0]} wurde bestätigt und gespeichert.`
            : `Änderungen für Abschnitte ${updatedSectionIds.join(", ")} wurden bestätigt und gespeichert.`;
          
          setChatMessages(prev => [...prev, {
            role: "assistant",
            text: confirmMessage
          }]);
          
          // Reset flag after state update (useEffect will handle auto-save)
          setTimeout(() => {
            isUpdatingFromChat.current = false;
          }, 100);
          
          // Note: History tracking happens automatically via useEffect when sections change
          // Since previews don't change sections state, they won't be tracked in history
          // Only approved changes (which update sections state) will be in undo/redo history
        } else {
          console.error("Updated document has no sections!");
          clearPreview();
          setChatMessages(prev => [...prev, {
            role: "assistant",
            text: "Fehler: Aktualisiertes Dokument hat keine Abschnitte. Bitte aktualisieren Sie die Seite."
          }]);
        }
      } catch (error: any) {
        console.error("Error fetching updated document:", error);
        clearPreview();
        setChatMessages(prev => [...prev, {
          role: "assistant",
          text: `Änderungen wurden gespeichert, aber es gab einen Fehler beim Aktualisieren der Ansicht: ${error.message || "Unknown error"}. Bitte aktualisieren Sie die Seite.`
        }]);
      }
    } catch (error: any) {
      console.error("Error approving edit:", error);
      setChatMessages(prev => [...prev, {
        role: "assistant",
        text: error.message || "Fehler beim Bestätigen der Änderungen. Bitte versuchen Sie es erneut."
      }]);
    } finally {
      setIsChatLoading(false);
    }
  }

  // Handle reject edit - discard preview
  function handleRejectEdit(_messageId: string) {
    // Clear preview
    clearPreview();
    
    // Add rejection message to chat
    setChatMessages(prev => [...prev, {
      role: "assistant",
      text: "Änderungen wurden verworfen. Sie können eine neue Bearbeitungsanfrage stellen."
    }]);
  }

  /**
   * Handle chat messages for section editing.
   * In reviewHeadings mode: supports "remove" commands for backward compatibility.
   * In editingContent mode: calls the chat API for section-specific edits.
   */
  async function handleChatMessage() {
    const userMessage = chatInput.trim();
    if (!userMessage || !documentId) {
      return;
    }

    // Add user message to chat
    setChatMessages(prev => [...prev, { role: "user", text: userMessage }]);
    const messageToSend = userMessage;
    setChatInput("");

    // In reviewHeadings mode, check if it's a "remove" command (backward compatibility)
    if (editorMode === "reviewHeadings") {
      const idsToRemove = parseRemoveCommand(messageToSend);
      
      if (idsToRemove.length > 0) {
        // Handle remove command (existing functionality)
        // Check if all referenced sections exist
        const existingIds = new Set(sections.map(s => s.id));
        const missingIds = idsToRemove.filter(id => !existingIds.has(id));
        
        if (missingIds.length > 0) {
          // Some sections don't exist
          const missingText = missingIds.length === 1 
            ? `I couldn't find section ${missingIds[0]}.`
            : `I couldn't find sections ${missingIds.join(", ")}.`;
          setChatMessages(prev => [...prev, { role: "assistant", text: missingText }]);
          return;
        }

        // Remove sections
        let updatedSections = sections.filter(s => !idsToRemove.includes(s.id));
        
        // Also remove any child sections
        idsToRemove.forEach(id => {
          updatedSections = updatedSections.filter(s => !s.id.startsWith(id + "."));
        });
        
        // Renumber remaining sections
        updatedSections = renumberSections(updatedSections);
        
        setSections(updatedSections);
        
        // Add assistant response
        const removedText = idsToRemove.length === 1
          ? `Removed section ${idsToRemove[0]}. Numbering has been updated.`
          : `Removed sections ${idsToRemove.join(", ")}. Numbering has been updated.`;
        setChatMessages(prev => [...prev, { role: "assistant", text: removedText }]);
        return;
      }
      // If not a remove command, fall through to chat API call
    }

    // Call chat API for section editing (editingContent mode or non-remove commands in reviewHeadings)
    try {
      setIsChatLoading(true);
      
      // Prepare conversation history (last 2-3 messages for context)
      const conversationHistory = chatMessages.slice(-3).map(msg => ({
        role: msg.role,
        text: msg.text
      }));
      
      const response = await apiPost<{
        message: string;
        updated_sections?: string[];
        is_question?: boolean;
        suggested_content?: Record<string, string>;
        requires_confirmation?: boolean;
      }>(`/documents/${documentId}/chat`, {
        message: messageToSend,
        last_edited_sections: lastEditedSections, // Send context for clarification suggestions
        conversation_history: conversationHistory, // Send conversation history for context
      });

      // If this was a question (not a section edit), just display the answer
      // No need to update sections or fetch document
      if (response.is_question) {
        // Question answered - no section updates needed
        setChatMessages(prev => [...prev, { 
          role: "assistant", 
          text: response.message 
        }]);
        return;
      }

      // If this requires confirmation (preview mode), show preview and wait for user approval
      if (response.requires_confirmation && response.suggested_content) {
        // NEW: Validate suggested_content before using it
        const validatedSuggestedContent: Record<string, string> = {};
        
        for (const [sectionId, content] of Object.entries(response.suggested_content)) {
          if (typeof content !== 'string' || content.trim().length === 0) {
            console.error(`Invalid suggested content for section ${sectionId}: empty or not a string`);
            continue;
          }
          
          // Check if content looks like user question (too short or matches user message)
          const userMessageLower = messageToSend.trim().toLowerCase();
          const contentLower = content.trim().toLowerCase();
          
          if (contentLower === userMessageLower || contentLower.length < 50) {
            console.error(`ERROR: Suggested content for section ${sectionId} appears to be user question or too short!`);
            console.error(`User message: ${userMessageLower}`);
            console.error(`Suggested content: ${contentLower.substring(0, 100)}...`);
            console.error(`Content length: ${content.trim().length}`);
            // Don't add this section to preview - it's invalid
            continue;
          }
          
          validatedSuggestedContent[sectionId] = content;
        }
        
        if (Object.keys(validatedSuggestedContent).length === 0) {
          // No valid suggested content - show error
          setChatMessages(prev => [...prev, {
            role: "assistant",
            text: "Fehler: Die generierte Vorschau enthält ungültige Daten. Bitte versuchen Sie es erneut."
          }]);
          return;
        }
        
        const messageId = `msg-${Date.now()}`;
        // Use validated content instead of raw response
        setChatMessages(prev => [...prev, {
          role: "assistant",
          text: response.message,
          suggestedContent: validatedSuggestedContent, // Use validated content
          requiresConfirmation: true,
          messageId: messageId
        }]);
        
        // Show preview with validated content
        setPreviewContent(validatedSuggestedContent);
        setPreviewSectionIds(Object.keys(validatedSuggestedContent));
        return;
      }

      // Add assistant response to chat (for non-question, non-preview responses)
      setChatMessages(prev => [...prev, { 
        role: "assistant", 
        text: response.message 
      }]);

      // If sections were updated, fetch the latest document to get updated content
      if (response.updated_sections && response.updated_sections.length > 0) {
        // Track last edited sections for context awareness
        setLastEditedSections(response.updated_sections);
        
        // Set flag to prevent auto-save from overwriting LLM updates
        isUpdatingFromChat.current = true;
        
        try {
          console.log("Fetching updated document after chat response...");
          const updatedDocument = await apiGet<any>(
            `/documents/${companyIdNum}/vorhabensbeschreibung`
          );
          
          if (updatedDocument.content_json && updatedDocument.content_json.sections) {
            console.log("Received updated document, updating sections state...");
            console.log("Updated sections:", response.updated_sections);
            
            // Find the updated section to verify content
            const updatedSection = updatedDocument.content_json.sections.find(
              (s: Section) => response.updated_sections?.includes(s.id)
            );
            if (updatedSection) {
              console.log(`Section ${updatedSection.id} content length:`, updatedSection.content?.length || 0);
              console.log(`Section ${updatedSection.id} content preview:`, updatedSection.content?.substring(0, 100));
            }
            
            // FIX: Replace entire sections array - ensures UI matches database
            // This is the authoritative update from backend
            setSections(updatedDocument.content_json.sections as Section[]);
            
            // Reset flag after state update (useEffect will skip auto-save)
            setTimeout(() => {
              isUpdatingFromChat.current = false;
            }, 100);
          } else {
            console.warn("Updated document has no sections in content_json");
            isUpdatingFromChat.current = false;
          }
        } catch (error: any) {
          console.error("Error fetching updated document:", error);
          isUpdatingFromChat.current = false;
          // Don't show error to user - the chat response already indicates success
          // The sections will be updated on next document load
        }
      }
    } catch (error: any) {
      console.error("Error sending chat message:", error);
      
      // Show error message in chat
      const errorMessage = error.message || "Failed to process your request. Please try again.";
      setChatMessages(prev => [...prev, { 
        role: "assistant", 
        text: errorMessage 
      }]);
      
      if (error.message.includes("Authentication required")) {
        logout();
      }
    } finally {
      setIsChatLoading(false);
    }
  }

  /**
   * Legacy function for backward compatibility - now calls handleChatMessage
   * @deprecated Use handleChatMessage instead
   */
  function handleAssistantModify() {
    handleChatMessage();
  }

  /**
   * Generate content for confirmed headings.
   * This function is only called when isContentReady is true,
   * so the backend error "Company preprocessing not finished" should never occur.
   * However, we still handle it gracefully if it does (edge cases).
   */
  async function handleAssistantCreateContent() {
    if (!documentId) {
      alert("Document ID not found. Please reload the page.");
      return;
    }

    // Double-check readiness before making request
    // This is a safety check - button should already be disabled if not ready
    if (!isContentReady) {
      // If somehow called when not ready, check status and show appropriate message
      const status = await checkCompanyProcessingStatus();
      if (status !== "done") {
        // Start polling if not already polling
        if (!isCheckingReadiness) {
          startProcessingStatusPoll();
        }
        // Don't show error popup - this is expected async processing
        return;
      }
    }

    try {
      setIsLoading(true);
      const updatedDocument = await apiPost<any>(
        `/documents/${documentId}/generate-content`
      );
      
      // Update sections with generated content
      if (updatedDocument.content_json && updatedDocument.content_json.sections) {
        setSections(updatedDocument.content_json.sections);
        setEditorMode("editingContent");
        // Success message - user can now edit
        alert("Content generated successfully! You can now review and edit it.");
      } else {
        throw new Error("Generated document has no sections");
      }
    } catch (error: any) {
      console.error("Error generating content:", error);
      
      // Handle specific "preprocessing not finished" error gracefully
      // This should rarely happen due to readiness checks, but handle it if it does
      if (error.message.includes("preprocessing not finished") || 
          error.message.includes("Company preprocessing not finished")) {
        // Don't show disruptive popup - start polling and show inline message
        if (!isCheckingReadiness) {
          startProcessingStatusPoll();
        }
        // The UI will show processing state automatically
        return;
      }
      
      // For other errors, show alert (these are unexpected)
      alert(`Failed to generate content: ${error.message || "Unknown error"}`);
      if (error.message.includes("Authentication required")) {
        logout();
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={styles.editorContainer}>
      {/* LEFT SIDEBAR */}
      <aside className={styles.sidebar}>
        <h2 className={styles.companyName}>{companyName}</h2>
        <p className={styles.documentLabel}>{documentLabel}</p>
        {isSaving && <p style={{ fontSize: "0.8rem", color: "var(--brand-text-medium)", marginBottom: "0.5rem" }}>Saving...</p>}

        {editorMode !== null && sections.length > 0 && (
          <>
            <h3 className={styles.headingLabel}>All Headings</h3>
            <div className={styles.headingList}>
              {sections.map((s) => {
                const depth = s.id.split(".").length;
                const levelClass = depth === 1 ? styles.headingLevel1 : depth === 2 ? styles.headingLevel2 : styles.headingLevel3;
                return (
                  <div
                    key={s.id}
                    onClick={() => handleClickHeading(s.id)}
                    className={`${styles.headingItem} ${levelClass}`}
                  >
                    {s.title}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </aside>

      {/* MAIN CONTENT */}
      <main className={styles.main}>
        {/* TOP TOOLBAR */}
        <header className={styles.toolbar}>
          <button 
            className={styles.undoRedoBtn}
            onClick={handleUndo}
            disabled={!canUndo}
            title={canUndo ? "Undo" : "Nothing to undo"}
          >
            Undo
          </button>
          <button 
            className={styles.undoRedoBtn}
            onClick={handleRedo}
            disabled={!canRedo}
            title={canRedo ? "Redo" : "Nothing to redo"}
          >
            Redo
          </button>

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
                <button 
                  className={styles.exportMenuItem}
                  onClick={async () => {
                    if (!documentId) {
                      alert("Document ID not found. Please reload the page.");
                      return;
                    }
                    try {
                      setShowExportMenu(false);
                      const response = await apiDownloadFile(`/documents/${documentId}/export?format=pdf`);
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${companyName}_Vorhabensbeschreibung.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                    } catch (error: any) {
                      console.error("Export error:", error);
                      alert(`Failed to export PDF: ${error.message || "Unknown error"}`);
                    }
                  }}
                >
                  Download PDF
                </button>
                <button 
                  className={styles.exportMenuItem}
                  onClick={async () => {
                    if (!documentId) {
                      alert("Document ID not found. Please reload the page.");
                      return;
                    }
                    try {
                      setShowExportMenu(false);
                      const response = await apiDownloadFile(`/documents/${documentId}/export?format=docx`);
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${companyName}_Vorhabensbeschreibung.docx`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                    } catch (error: any) {
                      console.error("Export error:", error);
                      alert(`Failed to export DOCX: ${error.message || "Unknown error"}`);
                    }
                  }}
                >
                  Download DOC
                </button>
              </div>
            )}
          </div>
        </header>

        <section className={styles.editorArea}>
          {/* Document editor */}
          <div className={styles.documentBox}>
            {isLoading ? (
              <p className={styles.noSectionsMessage}>Loading document...</p>
            ) : editorMode === null ? (
              <p className={styles.noSectionsMessage}>
                Click <strong>AI: Create Headings</strong> in the Assistant panel to generate the
                structure. All headings and content will appear here in one
                continuous document.
              </p>
            ) : editorMode === "reviewHeadings" ? (
              <>
                {sections.map((s) => {
                  const depth = s.id.split(".").length;
                  const isTopLevel = depth === 1;
                  return (
                    <div
                      key={s.id}
                      ref={(el) => { sectionRefs.current[s.id] = el; }}
                      className={`${styles.sectionBlock} ${isTopLevel ? styles.headingRowLevel1 : styles.headingRowLevel2}`}
                      style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                    >
                      <span style={{ minWidth: "60px", fontSize: isTopLevel ? "0.95rem" : "0.85rem", fontWeight: isTopLevel ? "600" : "400" }}>
                        {s.id}.
                      </span>
                      <span style={{ 
                        flex: 1, 
                        fontSize: isTopLevel ? "1rem" : "0.9rem",
                        fontWeight: isTopLevel ? "600" : "400",
                        paddingLeft: depth > 1 ? `${(depth - 1) * 1.2}rem` : "0"
                      }}>
                        {s.title.replace(/^[\d.]+\.\s*/, "")}
                      </span>
                      <button
                        onClick={() => handleDeleteHeading(s.id)}
                        style={{
                          padding: "0.2rem 0.5rem",
                          border: "1px solid #b32020",
                          backgroundColor: "#fff",
                          color: "#b32020",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "0.8rem"
                        }}
                      >
                        ❌
                      </button>
                    </div>
                  );
                })}
                <div style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid var(--brand-border)" }}>
                  <button
                    onClick={handleConfirmHeadings}
                    className={styles.fillContentBtn}
                    style={{ width: "100%" }}
                  >
                    Confirm Headings
                  </button>
                </div>
              </>
            ) : editorMode === "confirmedHeadings" ? (
              <>
                {sections.map((s) => {
                  const depth = s.id.split(".").length;
                  const isTopLevel = depth === 1;
                  return (
                    <div
                      key={s.id}
                      ref={(el) => { sectionRefs.current[s.id] = el; }}
                      className={`${styles.sectionBlock} ${isTopLevel ? styles.headingRowLevel1 : styles.headingRowLevel2}`}
                      style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                    >
                      <span style={{ minWidth: "60px", fontSize: isTopLevel ? "0.95rem" : "0.85rem", fontWeight: isTopLevel ? "600" : "400" }}>
                        {s.id}.
                      </span>
                      <span style={{ 
                        flex: 1, 
                        fontSize: isTopLevel ? "1rem" : "0.9rem",
                        fontWeight: isTopLevel ? "600" : "400",
                        paddingLeft: depth > 1 ? `${(depth - 1) * 1.2}rem` : "0"
                      }}>
                        {s.title.replace(/^[\d.]+\.\s*/, "")}
                      </span>
                    </div>
                  );
                })}
              </>
            ) : (
              sections.map((s) => {
                const depth = s.id.split(".").length;
                const isTopLevel = depth === 1;
                return (
                  <div
                    key={s.id}
                    ref={(el) => { sectionRefs.current[s.id] = el; }}
                    className={styles.sectionBlock}
                  >
                    <div 
                      className={styles.sectionTitle}
                      style={{
                        fontWeight: isTopLevel ? "600" : "400",
                        fontSize: isTopLevel ? "1.1rem" : "0.95rem",
                        marginBottom: isTopLevel ? "0.6rem" : "0.4rem",
                        paddingLeft: depth > 1 ? `${(depth - 1) * 1.2}rem` : "0"
                      }}
                    >
                      {s.title}
                    </div>
                    {previewContent && previewSectionIds.includes(s.id) ? (
                      // Show diff view for sections in preview mode
                      <div style={{ 
                        border: "2px solid var(--brand-gold)", 
                        borderRadius: "6px",
                        padding: "0.8rem",
                        backgroundColor: "#fffef0"
                      }}>
                        <div style={{ 
                          fontSize: "0.75rem", 
                          color: "var(--brand-gold-dark)",
                          marginBottom: "0.5rem",
                          fontWeight: "600"
                        }}>
                          Preview (not saved yet)
                        </div>
                        {/* Original content (faded/strikethrough) */}
                        {s.content && (
                          <div style={{
                            marginBottom: "0.8rem",
                            paddingBottom: "0.8rem",
                            borderBottom: "1px dashed #ccc"
                          }}>
                            <div style={{
                              fontSize: "0.75rem",
                              color: "#999",
                              marginBottom: "0.3rem",
                              fontWeight: "600"
                            }}>
                              Original:
                            </div>
                            <div style={{
                              color: "#999",
                              textDecoration: "line-through",
                              opacity: 0.6,
                              fontSize: "0.9rem",
                              lineHeight: "1.5"
                            }}>
                              {s.content}
                            </div>
                          </div>
                        )}
                        {/* Suggested content (highlighted) */}
                        <div>
                          <div style={{
                            fontSize: "0.75rem",
                            color: "var(--brand-gold-dark)",
                            marginBottom: "0.3rem",
                            fontWeight: "600"
                          }}>
                            Suggested:
                          </div>
                          <div style={{
                            color: "var(--brand-text-dark)",
                            backgroundColor: "#fff9e6",
                            padding: "0.6rem",
                            borderRadius: "4px",
                            fontSize: "0.9rem",
                            lineHeight: "1.5",
                            whiteSpace: "pre-wrap"
                          }}>
                            {previewContent[s.id]}
                          </div>
                        </div>
                      </div>
                    ) : (
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
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Assistant panel */}
          <div className={styles.assistantBox}>
            <div className={styles.assistantHeader}>Assistant</div>

            <div className={styles.assistantMessages}>
              {/* Show initial instructions only when there are no chat messages */}
              {chatMessages.length === 0 && (
                <>
                  {editorMode === null && (
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

                  {editorMode === "reviewHeadings" && (
                    <div>
                      <p className={styles.afterHeadingText}>
                        Review and modify headings in the main area. Use the delete buttons to remove sections.
                        When ready, click <strong>Confirm Headings</strong> at the bottom of the main area.
                      </p>
                      <p className={styles.textHint} style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
                        You can also type commands like "remove 5.2 and 5.3" in the chat below.
                      </p>
                    </div>
                  )}

                  {editorMode === "confirmedHeadings" && (
                    <div>
                      {/* Show processing status message when checking readiness */}
                      {isCheckingReadiness && (
                        <div style={{ marginBottom: "1rem" }}>
                          <p className={styles.afterHeadingText} style={{ color: "var(--brand-gold-dark)" }}>
                            {companyProcessingStatus === "processing" 
                              ? "Analyzing company information…"
                              : companyProcessingStatus === "pending"
                              ? "Preparing company data for content generation…"
                              : "Preparing content…"}
                          </p>
                          <p className={styles.textHint} style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                            Content generation will be available shortly.
                          </p>
                        </div>
                      )}

                      {/* Show ready state when processing is complete */}
                      {!isCheckingReadiness && isContentReady && (
                        <>
                          <p className={styles.afterHeadingText}>
                            Headings have been confirmed and are now locked. You can now create content for each section.
                          </p>

                          <button
                            onClick={handleAssistantCreateContent}
                            className={styles.fillContentBtn}
                            style={{ marginTop: "1rem" }}
                            disabled={isLoading}
                          >
                            {isLoading ? "Generating content…" : "Create content for confirmed headings"}
                          </button>

                          <p className={styles.textHint} style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
                            Once you click the button above, you'll be able to edit content for each section.
                          </p>
                        </>
                      )}

                      {/* Show message when processing failed */}
                      {!isCheckingReadiness && companyProcessingStatus === "failed" && (
                        <div>
                          <p className={styles.afterHeadingText} style={{ color: "#b32020" }}>
                            Company data processing encountered an issue. Content generation may be limited.
                          </p>
                          <p className={styles.textHint} style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                            You can still proceed, but generated content may be incomplete.
                          </p>
                          <button
                            onClick={handleAssistantCreateContent}
                            className={styles.fillContentBtn}
                            style={{ marginTop: "1rem" }}
                            disabled={isLoading}
                          >
                            {isLoading ? "Generating content…" : "Create content anyway"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {editorMode === "editingContent" && (
                    <div>
                      <p className={styles.afterHeadingText}>
                        You can now edit content for each section. Fill in the textareas in the main area.
                      </p>

                      <p className={styles.textHint} style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
                        You can also refine sections using the chat below.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Display chat messages */}
              {chatMessages.length > 0 && (
                <div className={styles.chatMessagesContainer}>
                  {chatMessages.map((msg, idx) => (
                    <div key={idx}>
                      <div
                        className={msg.role === "user" ? styles.chatMessageUser : styles.chatMessageAssistant}
                      >
                        <div className={styles.chatMessageText}>{msg.text}</div>
                      </div>
                      {/* Show approve/reject buttons for messages requiring confirmation */}
                      {msg.requiresConfirmation && msg.suggestedContent && msg.messageId && (
                        <div style={{ 
                          display: "flex", 
                          gap: "0.5rem", 
                          marginTop: "0.5rem",
                          marginBottom: "0.5rem",
                          justifyContent: msg.role === "assistant" ? "flex-start" : "flex-end"
                        }}>
                          <button
                            onClick={() => handleApproveEdit(msg.messageId!, msg.suggestedContent!)}
                            disabled={isChatLoading}
                            style={{
                              padding: "0.4rem 0.8rem",
                              backgroundColor: "var(--brand-gold)",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: isChatLoading ? "not-allowed" : "pointer",
                              fontSize: "0.85rem",
                              fontWeight: "500"
                            }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectEdit(msg.messageId!)}
                            disabled={isChatLoading}
                            style={{
                              padding: "0.4rem 0.8rem",
                              backgroundColor: "#f5f5f5",
                              color: "var(--brand-text-dark)",
                              border: "1px solid var(--brand-border)",
                              borderRadius: "6px",
                              cursor: isChatLoading ? "not-allowed" : "pointer",
                              fontSize: "0.85rem",
                              fontWeight: "500"
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className={styles.chatMessageAssistant}>
                      <div className={styles.chatMessageText}>Processing...</div>
                    </div>
                  )}
                  <div ref={chatMessagesEndRef} />
                </div>
              )}
            </div>

            {/* Chat input - only show in headings or content mode */}
            {editorMode !== null && (
              <div className={styles.chatInputArea}>
                <button className={styles.plusBtn}>+</button>

                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && chatInput.trim() && !isChatLoading) {
                      handleChatMessage();
                    }
                  }}
                  placeholder={
                    editorMode === "reviewHeadings" 
                      ? "Type instructions e.g. 'remove 2.3' or 'Section 2.1: make it concise'…" 
                      : "Type instructions e.g. 'Section 2.1: make it more concise'…"
                  }
                  className={styles.chatInput}
                  disabled={isChatLoading}
                />

                <button
                  className={styles.sendBtn}
                  onClick={() => {
                    if (chatInput.trim() && !isChatLoading) {
                      handleChatMessage();
                    }
                  }}
                  disabled={!chatInput.trim() || isChatLoading}
                >
                  {isChatLoading ? "…" : "⇨"}
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
