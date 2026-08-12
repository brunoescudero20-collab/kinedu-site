// Shared with the article migration script (src/db/seed/migrate-articles.js)
// so manually-created and migrated articles get slugs the same way.
export function slugify(text) {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
