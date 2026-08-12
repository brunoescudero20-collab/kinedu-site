// App-level validation. The DB has the final say via CHECK constraints and
// unique indexes — this layer exists only to return a clear 400 with a
// specific message instead of a raw Postgres constraint-violation error.

const DOI_RE = /^10\.\d{4,9}\/\S+$/i;
const PMID_RE = /^\d+$/;
const STATUS_VALUES = ['pending', 'approved', 'archived'];
const STUDY_TYPES = [
  'meta_analysis', 'systematic_review', 'rct', 'cohort', 'cross_sectional',
  'case_control', 'narrative_review', 'position_stand', 'case_report', 'pilot_study', 'other',
];

export function isValidDoi(doi) {
  return typeof doi === 'string' && DOI_RE.test(doi.trim());
}

export function isValidPmid(pmid) {
  return typeof pmid === 'string' && PMID_RE.test(pmid.trim());
}

export function isValidStatus(status) {
  return STATUS_VALUES.includes(status);
}

export function isValidStudyType(studyType) {
  return STUDY_TYPES.includes(studyType);
}

/**
 * Validates the subset of article fields present in `payload`.
 * @returns {string[]} list of human-readable errors; empty if valid.
 */
export function validateArticleInput(payload) {
  const errors = [];
  if (!payload.title || !payload.title.trim()) errors.push('title é obrigatório.');
  if (!payload.authors || !payload.authors.trim()) errors.push('authors é obrigatório.');
  if (payload.doi !== undefined && payload.doi !== null && !isValidDoi(payload.doi)) {
    errors.push('doi não está em um formato válido (esperado algo como 10.xxxx/yyyy).');
  }
  if (payload.pmid !== undefined && payload.pmid !== null && !isValidPmid(payload.pmid)) {
    errors.push('pmid deve conter apenas dígitos.');
  }
  if (payload.published_at !== undefined && payload.published_at !== null) {
    const d = new Date(payload.published_at);
    if (Number.isNaN(d.getTime())) errors.push('published_at não é uma data válida.');
  }
  if (payload.status !== undefined && !isValidStatus(payload.status)) {
    errors.push(`status deve ser um de: ${STATUS_VALUES.join(', ')}.`);
  }
  if (payload.study_type !== undefined && payload.study_type !== null && !isValidStudyType(payload.study_type)) {
    errors.push(`study_type deve ser um de: ${STUDY_TYPES.join(', ')}.`);
  }
  return errors;
}

export { STATUS_VALUES, STUDY_TYPES };
