-- Page grants now carry a permission level: 'edit' (can edit the page)
-- or 'view' (page-level view access). Existing rows default to 'edit',
-- preserving their current meaning.
ALTER TABLE page_grants ADD COLUMN permission TEXT NOT NULL DEFAULT 'edit'
    CHECK (permission IN ('edit', 'view'));
