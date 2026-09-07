import { logger } from '../utils/logger.js';

// Postgres error codes we want to translate into friendly 4xx responses
// instead of leaking a raw constraint name to the client.
const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';
const PG_FK_VIOLATION = '23503';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'not_found', message: `Rota não encontrada: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.code === PG_UNIQUE_VIOLATION) {
    logger.warn('Unique constraint violation', { detail: err.detail, constraint: err.constraint });
    const messages = {
      articles_doi_unique: 'Já existe um artigo com esse DOI.',
      articles_pmid_unique: 'Já existe um artigo com esse PMID.',
      articles_title_year_unique: 'Já existe um artigo com esse título e ano.',
      articles_slug_key: 'Já existe um artigo com esse slug.',
      users_email_key: 'Já existe uma conta com esse e-mail.',
      categories_slug_key: 'Já existe uma categoria com esse slug.',
      tags_slug_key: 'Já existe uma tag com esse slug.',
    };
    return res.status(409).json({
      error: 'conflict',
      message: messages[err.constraint] || 'Esse registro já existe (violação de identificador único).',
    });
  }
  if (err.code === PG_CHECK_VIOLATION) {
    logger.warn('Check constraint violation', { constraint: err.constraint });
    return res.status(400).json({ error: 'invalid_value', message: `Valor inválido para o campo controlado por "${err.constraint}".` });
  }
  if (err.code === PG_FK_VIOLATION) {
    logger.warn('Foreign key violation', { constraint: err.constraint });
    return res.status(400).json({ error: 'invalid_reference', message: 'Referência a um registro que não existe (categoria, tag ou usuário).' });
  }

  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  const status = err.status || 500;
  res.status(status).json({ error: 'internal_error', message: status === 500 ? 'Erro interno.' : err.message });
}
