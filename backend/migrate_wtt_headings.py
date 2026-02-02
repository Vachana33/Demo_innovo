"""
Migration script to update existing WTT documents with new template headings.

This script:
1. Loads the current WTT v1 template headings
2. Finds all documents that should use WTT template
3. Updates section titles to match template while preserving content
4. Handles legacy documents and documents with WTT funding programs
"""

import sys
from app.database import SessionLocal
from app.models import Document, FundingProgram
from app.templates import get_template

import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def migrate_document_headings(dry_run=True):
    """
    Migrate document headings to match WTT v1 template.

    Args:
        dry_run: If True, only show what would be changed without saving
    """
    db = SessionLocal()

    try:
        # Get the current WTT v1 template
        try:
            template = get_template("wtt_v1")
            template_sections = template.get("sections", [])
        except Exception as e:
            logger.error(f"Failed to load WTT v1 template: {str(e)}")
            return

        # Create a mapping of section ID -> new title from template
        template_title_map = {}
        for section in template_sections:
            section_id = section.get("id")
            new_title = section.get("title")
            if section_id and new_title:
                template_title_map[section_id] = new_title

        logger.info(f"Loaded template with {len(template_title_map)} sections")

        # Find all documents that should use WTT template
        # 1. Documents with funding_program_id that has template_name='wtt_v1'
        wtt_programs = db.query(FundingProgram).filter(
            FundingProgram.template_name == 'wtt_v1'
        ).all()
        wtt_program_ids = [p.id for p in wtt_programs]

        documents_to_update = []

        if wtt_program_ids:
            docs_with_program = db.query(Document).filter(
                Document.funding_program_id.in_(wtt_program_ids),
                Document.type == 'vorhabensbeschreibung'
            ).all()
            documents_to_update.extend(docs_with_program)
            logger.info(f"Found {len(docs_with_program)} documents with WTT funding programs")

        # 2. Legacy documents (no funding_program_id) - assume they might be WTT
        # We'll check if they have matching section IDs
        legacy_docs = db.query(Document).filter(
            Document.funding_program_id.is_(None),
            Document.type == 'vorhabensbeschreibung'
        ).all()
        logger.info(f"Found {len(legacy_docs)} legacy documents")

        # Filter legacy docs to only those that match WTT structure
        # (have section IDs that match template)
        wtt_legacy_docs = []
        for doc in legacy_docs:
            sections = doc.content_json.get("sections", [])
            if sections:
                # Check if document has section IDs that match template
                doc_section_ids = {s.get("id") for s in sections}
                template_section_ids = set(template_title_map.keys())
                # If at least 50% of template sections are present, consider it WTT
                matching_ids = doc_section_ids.intersection(template_section_ids)
                if len(matching_ids) >= len(template_section_ids) * 0.5:
                    wtt_legacy_docs.append(doc)

        documents_to_update.extend(wtt_legacy_docs)
        logger.info(f"Found {len(wtt_legacy_docs)} legacy documents matching WTT structure")

        logger.info(f"\nTotal documents to update: {len(documents_to_update)}")

        # Update each document
        updated_count = 0
        skipped_count = 0

        for doc in documents_to_update:
            try:
                sections = doc.content_json.get("sections", [])
                if not sections:
                    logger.warning(f"Document {doc.id} has no sections, skipping")
                    skipped_count += 1
                    continue

                # Track changes
                changes_made = False
                updated_sections = []

                for section in sections:
                    section_id = section.get("id")
                    old_title = section.get("title", "")

                    # Check if this section ID exists in template
                    if section_id in template_title_map:
                        new_title = template_title_map[section_id]

                        # Only update if title is different
                        if old_title != new_title:
                            # Preserve all other fields (content, type, etc.)
                            updated_section = section.copy()
                            updated_section["title"] = new_title
                            updated_sections.append(updated_section)
                            changes_made = True

                            if dry_run:
                                logger.info(f"  Document {doc.id}, Section {section_id}:")
                                logger.info(f"    Old: {old_title[:80]}...")
                                logger.info(f"    New: {new_title[:80]}...")
                        else:
                            updated_sections.append(section)
                    else:
                        # Section ID not in template - keep as is
                        updated_sections.append(section)

                if changes_made:
                    if not dry_run:
                        # Update document
                        doc.content_json = {"sections": updated_sections}
                        db.add(doc)
                        logger.info(f"✓ Updated document {doc.id} ({len([s for s in updated_sections if s.get('id') in template_title_map])} sections matched)")
                    else:
                        logger.info(f"  Would update document {doc.id} ({len([s for s in updated_sections if s.get('id') in template_title_map])} sections would be updated)")
                    updated_count += 1
                else:
                    logger.info(f"  Document {doc.id} already has correct headings, skipping")
                    skipped_count += 1

            except Exception as e:
                logger.error(f"Error processing document {doc.id}: {str(e)}")
                import traceback
                traceback.print_exc()
                skipped_count += 1

        if not dry_run:
            db.commit()
            logger.info("\n✓ Migration complete!")
            logger.info(f"  Updated: {updated_count} documents")
            logger.info(f"  Skipped: {skipped_count} documents")
        else:
            logger.info("\n✓ Dry run complete!")
            logger.info(f"  Would update: {updated_count} documents")
            logger.info(f"  Would skip: {skipped_count} documents")
            logger.info("\nTo apply changes, run with dry_run=False")

    except Exception as e:
        db.rollback()
        logger.error(f"Migration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    # Check command line argument
    dry_run = True
    if len(sys.argv) > 1 and sys.argv[1] == "--apply":
        dry_run = False
        logger.info("Running migration in APPLY mode (changes will be saved)")
    else:
        logger.info("Running migration in DRY RUN mode (no changes will be saved)")
        logger.info("Use --apply flag to actually update documents")

    migrate_document_headings(dry_run=dry_run)
