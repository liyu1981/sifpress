/*
 * The region between the markers below is replaced wholesale by
 * build.php (via preg_replace_callback, so no $/backslash munging).
 * It carries the SQL migration scripts embedded at build time, so the
 * single dist/index.php artifact needs no migrations/ folder at runtime.
 */
// ___BEGIN_MIGRATIONS___
const MIGRATIONS = [];
// ___END_MIGRATIONS___
