from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Document, Company, User
from app.schemas import DocumentResponse, DocumentUpdate, DocumentContent, DocumentSection
from app.dependencies import get_current_user
from typing import List
import os
import json
import re
import logging
import io
from openai import OpenAI

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get(
    "/documents/{company_id}/vorhabensbeschreibung",
    response_model=DocumentResponse
)
def get_document(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get a document for a company by type.
    Currently only supports "vorhabensbeschreibung".
    """
    # Verify company exists
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    # Get or create document
    document = db.query(Document).filter(
        Document.company_id == company_id,
        Document.type == "vorhabensbeschreibung"
    ).first()
    
    if not document:
        # Create empty document if it doesn't exist
        document = Document(
            company_id=company_id,
            type="vorhabensbeschreibung",
            content_json={"sections": []}
        )
        db.add(document)
        db.commit()
        db.refresh(document)
    
    return document

@router.put(
    "/documents/{document_id}",
    response_model=DocumentResponse
)
def update_document(
    document_id: int,
    document_data: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update a document's content.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # Update content
    document.content_json = document_data.content_json
    
    try:
        db.commit()
        db.refresh(document)
        return document
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update document: {str(e)}"
        )


@router.post(
    "/documents/{document_id}/generate-content",
    response_model=DocumentResponse
)
def generate_content(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate content for Vorhabensbeschreibung document using OpenAI.
    Requires company preprocessing to be completed.
    """
    # Load document
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # Verify document type
    if document.type != "vorhabensbeschreibung":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Content generation only supported for vorhabensbeschreibung documents"
        )
    
    # Load associated company
    company = db.query(Company).filter(Company.id == document.company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    # Check processing status
    if company.processing_status != "done":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Company preprocessing not finished"
        )
    
    # Load confirmed headings from document
    content_json = document.content_json
    if not content_json or "sections" not in content_json:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document has no sections. Please create and confirm headings first."
        )
    
    sections = content_json["sections"]
    if not sections or len(sections) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document has no confirmed headings. Please create and confirm headings first."
        )
    
    # Build OpenAI prompt
    company_name = company.name or "Unknown Company"
    website_text = company.website_text or ""
    transcript_text = company.transcript_text or ""
    
    # Smart truncation: Use full text, but if extremely long, use intelligent truncation
    # GPT-4o-mini can handle ~128k tokens, so we can be more generous
    # For very long texts, we'll use the most relevant parts (beginning + end)
    MAX_TEXT_LENGTH = 50000  # Increased from 5000 to 50000 characters
    
    def smart_truncate(text: str, max_length: int) -> str:
        """Truncate text intelligently, keeping beginning and end if too long."""
        if len(text) <= max_length:
            return text
        # Keep first 60% and last 40% to preserve context
        first_part = text[:int(max_length * 0.6)]
        last_part = text[-int(max_length * 0.4):]
        return f"{first_part}\n\n[... content truncated ...]\n\n{last_part}"
    
    website_text_processed = smart_truncate(website_text, MAX_TEXT_LENGTH)
    transcript_text_processed = smart_truncate(transcript_text, MAX_TEXT_LENGTH)
    
    # Build headings list for prompt
    headings_list = []
    for section in sections:
        section_id = section.get('id', '')
        section_title = section.get('title', '')
        # Remove numbering prefix from title
        clean_title = re.sub(r'^[\d.]+\.\s*', '', section_title)
        headings_list.append(f"{section_id}. {clean_title}")
    headings_text = "\n".join(headings_list)
    
    prompt = f"""You are an expert consultant helping to write a "Vorhabensbeschreibung" (project description) for a funding application.

Company Information:
- Company Name: {company_name}
- Website Content: {website_text_processed}
- Meeting Transcript: {transcript_text_processed}

The document has the following confirmed headings structure:
{headings_text}

Generate detailed, professional content for each section based on the company information provided above. Write in German, using formal business language appropriate for a funding application.

IMPORTANT: Return ONLY a valid JSON object with this exact structure:
{{
  "section_id_1": "generated content for section 1",
  "section_id_2": "generated content for section 2",
  ...
}}

Where section_id matches the ID from the headings list above (e.g., "0", "1", "1.1", "2.3", etc.).

Do NOT include any markdown formatting, explanations, or text outside the JSON object. Return ONLY the JSON object."""

    # Get OpenAI API key from environment
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OpenAI API key not configured. Set OPENAI_API_KEY environment variable."
        )
    
    # Call OpenAI
    try:
        client = OpenAI(api_key=api_key)
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Using gpt-4o-mini for cost efficiency, can be changed to gpt-4 if needed
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional consultant specializing in funding applications. You write clear, structured, and persuasive project descriptions in German."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        # Extract response content
        response_text = response.choices[0].message.content
        logger.info(f"OpenAI response received for document {document_id}")
        
    except Exception as e:
        logger.error(f"OpenAI API error for document {document_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OpenAI API error: {str(e)}"
        )
    
    # Parse JSON response
    try:
        generated_content = json.loads(response_text)
        logger.info(f"Parsed OpenAI JSON response for document {document_id}")
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error for document {document_id}: {str(e)}. Response was: {response_text[:500]}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse OpenAI response as JSON: {str(e)}"
        )
    
    # Map generated content back to sections
    updated_sections = []
    for section in sections:
        section_id = section.get("id", "")
        section_title = section.get("title", "")
        
        # Get generated content for this section ID
        generated_text = generated_content.get(section_id, "")
        
        # If no content generated, keep existing content or use empty string
        content = generated_text if generated_text else section.get("content", "")
        
        updated_sections.append({
            "id": section_id,
            "title": section_title,
            "content": content
        })
    
    # Update document
    document.content_json = {"sections": updated_sections}
    
    try:
        db.commit()
        db.refresh(document)
        logger.info(f"Successfully generated and saved content for document {document_id}")
        return document
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save generated content for document {document_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save generated content: {str(e)}"
        )


@router.get("/documents/{document_id}/export")
def export_document(
    document_id: int,
    format: str = "pdf",  # "pdf" or "docx"
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Export document as PDF or DOCX file.
    """
    # Load document
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # Load associated company for filename
    company = db.query(Company).filter(Company.id == document.company_id).first()
    company_name = company.name if company else "Document"
    # Sanitize filename
    safe_company_name = re.sub(r'[^\w\s-]', '', company_name).strip().replace(' ', '_')
    
    # Get document content
    content_json = document.content_json
    if not content_json or "sections" not in content_json:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document has no content to export"
        )
    
    sections = content_json["sections"]
    
    if format.lower() == "pdf":
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
            from reportlab.lib.enums import TA_LEFT
            
            # Create PDF in memory
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=A4)
            story = []
            styles = getSampleStyleSheet()
            
            # Custom styles
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=14,
                textColor=(0.2, 0.2, 0.2),
                spaceAfter=12,
                fontName='Helvetica-Bold'
            )
            
            content_style = ParagraphStyle(
                'CustomContent',
                parent=styles['Normal'],
                fontSize=11,
                textColor=(0.1, 0.1, 0.1),
                spaceAfter=12,
                leftIndent=0,
                alignment=TA_LEFT
            )
            
            # Add sections to PDF
            for section in sections:
                title = section.get("title", "")
                content = section.get("content", "")
                
                # Ensure content is a string (handle dict/other types)
                if not isinstance(content, str):
                    if isinstance(content, dict):
                        # If content is a dict, convert to string representation
                        content = str(content)
                    elif content is None:
                        content = ""
                    else:
                        content = str(content)
                
                if title:
                    story.append(Paragraph(title, title_style))
                    story.append(Spacer(1, 6))
                
                if content:
                    # Escape HTML and convert newlines
                    content_escaped = content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    content_escaped = content_escaped.replace("\n", "<br/>")
                    story.append(Paragraph(content_escaped, content_style))
                    story.append(Spacer(1, 12))
            
            # Build PDF
            doc.build(story)
            buffer.seek(0)
            
            filename = f"{safe_company_name}_Vorhabensbeschreibung.pdf"
            return Response(
                content=buffer.getvalue(),
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}"
                }
            )
        except ImportError:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="PDF export requires reportlab library. Install with: pip install reportlab"
            )
        except Exception as e:
            logger.error(f"PDF export error for document {document_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate PDF: {str(e)}"
            )
    
    elif format.lower() == "docx" or format.lower() == "doc":
        try:
            from docx import Document as DocxDocument
            from docx.shared import Pt, Inches
            from docx.enum.text import WD_ALIGN_PARAGRAPH
            
            # Create DOCX document
            docx = DocxDocument()
            
            # Add sections to DOCX
            for section in sections:
                title = section.get("title", "")
                content = section.get("content", "")
                
                if title:
                    title_para = docx.add_paragraph(title)
                    title_para.style = 'Heading 1'
                    title_run = title_para.runs[0] if title_para.runs else title_para.add_run(title)
                    title_run.font.size = Pt(14)
                    title_run.bold = True
                
                if content:
                    content_para = docx.add_paragraph(content)
                    content_para.style = 'Normal'
                    for run in content_para.runs:
                        run.font.size = Pt(11)
                    # Add spacing after content
                    docx.add_paragraph()
            
            # Save to buffer
            buffer = io.BytesIO()
            docx.save(buffer)
            buffer.seek(0)
            
            filename = f"{safe_company_name}_Vorhabensbeschreibung.docx"
            return Response(
                content=buffer.getvalue(),
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}"
                }
            )
        except ImportError:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="DOCX export requires python-docx library. Install with: pip install python-docx"
            )
        except Exception as e:
            logger.error(f"DOCX export error for document {document_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate DOCX: {str(e)}"
            )
    
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported export format: {format}. Supported formats: pdf, docx"
        )

