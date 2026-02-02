"""
Phase 2.5: Template Resolver

Resolves templates from both system (Python modules) and user (database) sources.
Provides a unified interface for template resolution based on (template_source, template_ref).
"""
import logging
from typing import Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from app.templates import get_template as get_system_template
from app.models import UserTemplate

logger = logging.getLogger(__name__)


def resolve_template(
    template_source: Optional[str],
    template_ref: Optional[str],
    db: Optional[Session] = None,
    user_email: Optional[str] = None
) -> Dict[str, Any]:
    """
    Resolve a template from either system or user source.

    Phase 2.5: Unified template resolver that handles:
    - System templates: template_source="system", template_ref="wtt_v1"
    - User templates: template_source="user", template_ref=<template_id>
    - Legacy fallback: If template_source is None, tries template_ref as system template name

    Args:
        template_source: "system" | "user" | None (for legacy)
        template_ref: System template name (e.g., "wtt_v1") or user template UUID
        db: Database session (required for user templates)
        user_email: User email (required for user templates, for ownership verification)

    Returns:
        Template structure dictionary with "sections" key

    Raises:
        ValueError: If template cannot be resolved or is invalid
        KeyError: If system template not found
    """
    # Legacy fallback: If template_source is None but template_ref exists, treat as system template
    if template_source is None and template_ref:
        logger.warning(f"Legacy template resolution: treating template_ref '{template_ref}' as system template")
        template_source = "system"

    # Validate template_source
    if template_source not in ["system", "user"]:
        raise ValueError(
            f"Invalid template_source: '{template_source}'. Must be 'system' or 'user'"
        )

    if not template_ref:
        raise ValueError("template_ref is required when template_source is set")

    # Resolve based on source
    if template_source == "system":
        logger.info(f"[TEMPLATE RESOLVER] Resolving system template: {template_ref}")
        try:
            template = get_system_template(template_ref)
            logger.info(f"[TEMPLATE RESOLVER] Successfully resolved system template: {template_ref}")
            return template
        except (KeyError, ValueError) as e:
            logger.error(f"[TEMPLATE RESOLVER] Failed to resolve system template '{template_ref}': {str(e)}")
            raise

    elif template_source == "user":
        if not db:
            raise ValueError("Database session required for user template resolution")
        if not user_email:
            raise ValueError("user_email required for user template resolution")

        logger.info(f"[TEMPLATE RESOLVER] Resolving user template: {template_ref} for user {user_email}")
        try:
            # Parse template_ref as UUID
            import uuid
            template_id = uuid.UUID(template_ref)

            # Query user template
            user_template = db.query(UserTemplate).filter(
                UserTemplate.id == template_id,
                UserTemplate.user_email == user_email
            ).first()

            if not user_template:
                logger.error(f"[TEMPLATE RESOLVER] User template '{template_ref}' not found or not owned by user {user_email}")
                raise ValueError(f"User template '{template_ref}' not found or access denied")

            # Validate template structure
            template_structure = user_template.template_structure
            if not isinstance(template_structure, dict):
                raise ValueError(f"User template '{template_ref}' has invalid structure: expected dict, got {type(template_structure)}")

            if "sections" not in template_structure:
                raise ValueError(f"User template '{template_ref}' missing 'sections' key")

            if not isinstance(template_structure["sections"], list):
                raise ValueError(f"User template '{template_ref}' sections must be a list, got {type(template_structure['sections'])}")

            logger.info(f"[TEMPLATE RESOLVER] Successfully resolved user template: {template_ref}")
            return template_structure

        except ValueError as e:
            if "not found" in str(e) or "invalid" in str(e).lower():
                raise
            logger.error(f"[TEMPLATE RESOLVER] Invalid template_ref UUID '{template_ref}': {str(e)}")
            raise ValueError(f"Invalid user template reference: {template_ref}") from e
        except Exception as e:
            logger.error(f"[TEMPLATE RESOLVER] Failed to resolve user template '{template_ref}': {str(e)}", exc_info=True)
            raise ValueError(f"Failed to resolve user template: {str(e)}") from e

    # Should never reach here
    raise ValueError(f"Unsupported template_source: {template_source}")


def get_template_for_funding_program(
    funding_program,
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Convenience function to resolve template from a FundingProgram object.

    Handles both new (template_source + template_ref) and legacy (template_name) formats.

    Args:
        funding_program: FundingProgram model instance
        db: Database session (required for user templates)

    Returns:
        Template structure dictionary

    Raises:
        ValueError: If template cannot be resolved
    """
    # Try new format first
    if funding_program.template_source and funding_program.template_ref:
        return resolve_template(
            template_source=funding_program.template_source,
            template_ref=funding_program.template_ref,
            db=db,
            user_email=funding_program.user_email
        )

    # Fallback to legacy template_name
    if funding_program.template_name:
        logger.info(f"[TEMPLATE RESOLVER] Using legacy template_name: {funding_program.template_name}")
        return resolve_template(
            template_source="system",
            template_ref=funding_program.template_name,
            db=db,
            user_email=funding_program.user_email
        )

    raise ValueError(f"Funding program {funding_program.id} has no template configured")
