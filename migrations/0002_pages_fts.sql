-- Full-text search over pages. External-content FTS5 (no duplicated body)
-- with sync triggers. trigram tokenizer gives substring search for both
-- English and CJK.

CREATE VIRTUAL TABLE pages_fts USING fts5(
    title,
    content_md,
    content = 'pages',
    content_rowid = 'id',
    tokenize = 'trigram'
);

CREATE TRIGGER pages_ai AFTER INSERT ON pages BEGIN
    INSERT INTO pages_fts(rowid, title, content_md)
    VALUES (new.id, new.title, new.content_md);
END;

CREATE TRIGGER pages_ad AFTER DELETE ON pages BEGIN
    INSERT INTO pages_fts(pages_fts, rowid, title, content_md)
    VALUES ('delete', old.id, old.title, old.content_md);
END;

CREATE TRIGGER pages_au AFTER UPDATE ON pages BEGIN
    INSERT INTO pages_fts(pages_fts, rowid, title, content_md)
    VALUES ('delete', old.id, old.title, old.content_md);
    INSERT INTO pages_fts(rowid, title, content_md)
    VALUES (new.id, new.title, new.content_md);
END;
