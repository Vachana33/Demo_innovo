# Feature Implementation Plan

## Overview
This document outlines implementation plans for three requested features:
1. Search functionality for companies/programs
2. Undo/Redo functionality for document editor
3. Document export (PDF/DOC)

---

## 1. Search Functionality for Companies/Programs

### Current State
- ❌ No search UI exists
- ❌ No backend search endpoints
- ✅ Lists are already fetched and stored in state

### Implementation Approach

#### Frontend (React)
**Location**: `frontend/src/pages/ProjectPage/ProjectsPage.tsx`

**Changes Needed**:
1. Add search input field above program/company lists
2. Add state for search query
3. Filter programs/companies based on search query
4. Real-time filtering as user types

**Implementation**:
```typescript
// Add search state
const [programSearchQuery, setProgramSearchQuery] = useState("");
const [companySearchQuery, setCompanySearchQuery] = useState("");

// Filter programs
const filteredPrograms = programs.filter(p => 
  p.title.toLowerCase().includes(programSearchQuery.toLowerCase()) ||
  (p.website && p.website.toLowerCase().includes(programSearchQuery.toLowerCase()))
);

// Filter companies
const filteredCompanies = companies.filter(c =>
  c.name.toLowerCase().includes(companySearchQuery.toLowerCase()) ||
  (c.website && c.website.toLowerCase().includes(companySearchQuery.toLowerCase()))
);
```

**UI Components**:
- Search input above "Funding Programs" section
- Search input above "Companies" section (when program selected)
- Clear search button (optional)

**Estimated Complexity**: ⭐ Low
- Pure frontend filtering
- No backend changes needed
- ~2-3 hours

---

#### Optional: Backend Search (Advanced)
If you want server-side search with better performance for large datasets:

**Backend Endpoint**:
```python
@router.get("/funding-programs/search")
def search_funding_programs(
    q: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # SQL LIKE query or full-text search
    programs = db.query(FundingProgram).filter(
        or_(
            FundingProgram.title.ilike(f"%{q}%"),
            FundingProgram.website.ilike(f"%{q}%")
        )
    ).all()
    return programs
```

**Estimated Complexity**: ⭐⭐ Medium
- Backend endpoint + frontend integration
- ~4-5 hours

---

## 2. Undo/Redo Functionality

### Current State
- ✅ UI buttons exist in toolbar
- ❌ No functionality implemented
- ✅ Document sections are stored in state

### Implementation Approach

#### Frontend (React)
**Location**: `frontend/src/pages/EditorPage/EditorPage.tsx`

**Changes Needed**:
1. Implement history stack for document sections
2. Track current position in history
3. Implement undo/redo handlers
4. Update history on section changes

**Implementation**:
```typescript
// Add history state
const [history, setHistory] = useState<Section[][]>([]);
const [historyIndex, setHistoryIndex] = useState(-1);

// Initialize history on load
useEffect(() => {
  if (sections.length > 0 && history.length === 0) {
    setHistory([sections]);
    setHistoryIndex(0);
  }
}, [sections]);

// Save to history on section changes (debounced)
useEffect(() => {
  if (isInitialLoad.current) return;
  
  const timeoutId = setTimeout(() => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...sections]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    
    // Limit history size (e.g., last 50 states)
    if (newHistory.length > 50) {
      newHistory.shift();
      setHistoryIndex(newHistory.length - 1);
    }
  }, 1000); // Debounce 1 second
  
  return () => clearTimeout(timeoutId);
}, [sections]);

// Undo handler
function handleUndo() {
  if (historyIndex > 0) {
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setSections([...history[newIndex]]);
  }
}

// Redo handler
function handleRedo() {
  if (historyIndex < history.length - 1) {
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setSections([...history[newIndex]]);
  }
}
```

**UI Updates**:
- Disable undo button when `historyIndex <= 0`
- Disable redo button when `historyIndex >= history.length - 1`
- Add visual feedback (optional)

**Estimated Complexity**: ⭐⭐ Medium
- State management and history tracking
- ~4-6 hours

---

## 3. Document Export (PDF/DOC)

### Current State
- ✅ Export menu UI exists
- ❌ Buttons have no functionality
- ✅ Document sections are available in state

### Implementation Approach

#### Option A: Frontend-Only Export (Recommended for MVP)

**PDF Export**:
- Use `jsPDF` or `react-pdf` library
- Convert sections to PDF format
- Download directly from browser

**DOC Export**:
- Use `docx` library (docx.js)
- Convert sections to Word document
- Download directly from browser

**Implementation**:
```typescript
// Install: npm install jspdf docx file-saver

import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';

async function handleExportPDF() {
  const doc = new jsPDF();
  let yPosition = 20;
  
  sections.forEach((section) => {
    // Add section title
    doc.setFontSize(14);
    doc.text(section.title, 20, yPosition);
    yPosition += 10;
    
    // Add section content
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(section.content || '', 170);
    doc.text(lines, 20, yPosition);
    yPosition += lines.length * 7;
    
    if (yPosition > 280) {
      doc.addPage();
      yPosition = 20;
    }
  });
  
  doc.save(`${companyName}_${documentLabel}.pdf`);
}

async function handleExportDOC() {
  const doc = new Document({
    sections: [{
      properties: {},
      children: sections.map(section => 
        new Paragraph({
          children: [
            new TextRun({
              text: section.title,
              bold: true,
              size: 28,
            }),
            new TextRun({
              text: '\n' + (section.content || ''),
              size: 24,
            }),
          ],
        })
      ),
    }],
  });
  
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${companyName}_${documentLabel}.docx`);
}
```

**Estimated Complexity**: ⭐⭐ Medium
- Library integration and formatting
- ~5-7 hours

---

#### Option B: Backend Export (Better for Production)

**Backend Endpoint**:
```python
@router.get("/documents/{document_id}/export")
def export_document(
    document_id: int,
    format: str = "pdf",  # "pdf" or "docx"
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Load document
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Generate PDF/DOC using reportlab or python-docx
    if format == "pdf":
        # Generate PDF
        pdf_buffer = generate_pdf(document.content_json)
        return Response(
            content=pdf_buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=document_{document_id}.pdf"}
        )
    elif format == "docx":
        # Generate DOCX
        docx_buffer = generate_docx(document.content_json)
        return Response(
            content=docx_buffer.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename=document_{document_id}.docx"}
        )
```

**Backend Dependencies**:
```txt
reportlab==4.0.7  # For PDF
python-docx==1.1.0  # For DOCX
```

**Estimated Complexity**: ⭐⭐⭐ High
- Backend endpoint + PDF/DOC generation
- ~8-10 hours

---

## Implementation Priority

### Recommended Order:
1. **Search** (⭐ Low) - Quick win, high value
2. **Undo/Redo** (⭐⭐ Medium) - Improves UX significantly
3. **Export** (⭐⭐ Medium) - Essential for document workflow

### Quick Start (MVP):
- Search: Frontend-only filtering
- Undo/Redo: Basic history stack
- Export: Frontend-only with jsPDF/docx

### Full Implementation:
- Search: Backend search with pagination
- Undo/Redo: Advanced with merge strategies
- Export: Backend generation with templates

---

## Dependencies Needed

### Frontend:
```json
{
  "jspdf": "^2.5.1",
  "docx": "^8.5.0",
  "file-saver": "^2.0.5"
}
```

### Backend (if using backend export):
```txt
reportlab==4.0.7
python-docx==1.1.0
```

---

## Testing Checklist

### Search:
- [ ] Search filters programs by title
- [ ] Search filters programs by website
- [ ] Search filters companies by name
- [ ] Search filters companies by website
- [ ] Search is case-insensitive
- [ ] Search clears when input is empty

### Undo/Redo:
- [ ] Undo reverts last change
- [ ] Redo reapplies undone change
- [ ] Multiple undo/redo works
- [ ] History is preserved on save
- [ ] Buttons disabled at history boundaries

### Export:
- [ ] PDF export generates valid PDF
- [ ] DOC export generates valid DOCX
- [ ] Exported files contain all sections
- [ ] File names are meaningful
- [ ] Formatting is preserved

---

## Estimated Total Time

- **MVP (Frontend-only)**: 12-16 hours
- **Full Implementation**: 20-25 hours

---

## Next Steps

1. **Confirm approach** for each feature
2. **Choose export method** (frontend vs backend)
3. **Prioritize features** (which to implement first)
4. **Start implementation** with highest priority feature





