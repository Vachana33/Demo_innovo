# Phase 2.5: Template System Implementation

## Overview

Phase 2.5 introduces a backend-owned template system that supports both system templates (Python modules) and user templates (database-stored). This enables flexible document structure definition while maintaining backward compatibility with existing documents.

## Implementation Summary

### 1. Database Models

#### UserTemplate Model
- **Location**: `backend/app/models.py`
- **Table**: `user_templates`
- **Fields**:
  - `id` (UUID, primary key)
  - `name` (String, user-friendly template name)
  - `description` (Text, optional)
  - `template_structure` (JSON, contains "sections" key)
  - `user_email` (String, foreign key to users.email)
  - `created_at`, `updated_at` (timestamps)

#### FundingProgram Updates
- **New Fields**:
  - `template_source` (String, nullable): "system" | "user"
  - `template_ref` (String, nullable): System template name or user template UUID
- **Legacy Field** (kept for backward compatibility):
  - `template_name` (String, nullable): Deprecated, but still supported

### 2. Template Resolver

**Location**: `backend/app/template_resolver.py`

The template resolver provides a unified interface for resolving templates from both sources:

- **`resolve_template(template_source, template_ref, db, user_email)`**: Core resolver function
  - Handles "system" templates (Python modules)
  - Handles "user" templates (database)
  - Legacy fallback: If `template_source` is None, treats `template_ref` as system template name

- **`get_template_for_funding_program(funding_program, db)`**: Convenience function
  - Tries new format (`template_source` + `template_ref`) first
  - Falls back to legacy `template_name` if new format not available
  - Automatically handles user ownership verification

### 3. Document Creation Updates

**Location**: `backend/app/routers/documents.py`

Updated `get_document()` endpoint to use the new template resolver:
- Replaced direct `get_template()` calls with `get_template_for_funding_program()`
- Added comprehensive logging with `[TEMPLATE RESOLVER]` prefix
- Maintains backward compatibility with legacy documents

### 4. Database Migration

**Location**: `backend/alembic/versions/55cd193493bc_add_phase_2_5_template_system.py`

Migration adds:
1. `template_source` and `template_ref` columns to `funding_programs` table
2. `user_templates` table with all required fields
3. Indexes for performance
4. Handles both PostgreSQL and SQLite

### 5. Milestone Table Support

Milestone table support was already implemented and verified:
- Template defines `type: "milestone_table"` for section 4.1
- Content stored as structured JSON: `{"milestones": [], "total_expenditure": None}`
- AI generation logic correctly excludes milestone tables
- No changes needed for Phase 2.5

## Key Features

### Template Resolution Flow

1. **System Templates**:
   - `template_source="system"`, `template_ref="wtt_v1"`
   - Resolved from Python modules in `backend/app/templates/`
   - Registered in `templates/__init__.py`

2. **User Templates**:
   - `template_source="user"`, `template_ref=<template_id>`
   - Resolved from `user_templates` table
   - Ownership verified (user_email must match)

3. **Legacy Support**:
   - If `template_source` is None but `template_name` exists, treated as system template
   - Ensures existing funding programs continue to work

### Section Flexibility

Sections created from templates are:
- **Renameable**: Users can change section titles
- **Deletable**: Users can remove sections
- **Extendable**: Users can add new subsections
- Template defines initial structure only; documents can be modified freely

### Logging

All template resolution operations are logged with `[TEMPLATE RESOLVER]` prefix:
- Template resolution attempts
- Success/failure status
- Template source and reference
- Document creation from templates

## Backward Compatibility

- Existing documents continue to work unchanged
- Legacy `template_name` field still supported
- Template resolver automatically handles legacy format
- No breaking changes to API or document structure

## Testing Checklist

- [ ] Run migration: `alembic upgrade head`
- [ ] Verify `user_templates` table created
- [ ] Verify `funding_programs` has `template_source` and `template_ref` columns
- [ ] Test document creation with system template (wtt_v1)
- [ ] Test document creation with legacy template_name
- [ ] Verify milestone_table sections work correctly
- [ ] Check logs for `[TEMPLATE RESOLVER]` messages

## Next Steps (Future Phases)

- Add API endpoints for user template CRUD operations
- Add frontend UI for template management
- Support template versioning
- Add template validation and preview

## Files Modified

1. `backend/app/models.py` - Added UserTemplate model, updated FundingProgram
2. `backend/app/template_resolver.py` - New file, template resolution logic
3. `backend/app/routers/documents.py` - Updated to use template resolver
4. `backend/alembic/versions/55cd193493bc_add_phase_2_5_template_system.py` - Migration

## Files Unchanged (As Required)

- No changes to AI generation logic
- No changes to prompts
- No changes to funding extraction
- No changes to document editor flow
- No changes to content_json structure
- Templates define structure only, not content generation
