// Valide body / query / params avec zod. Les valeurs validées sont dans req.valid.{body,query,params}.
module.exports = (schemas) => (req, res, next) => {
  try {
    req.valid = {};
    for (const part of ['params', 'query', 'body', 'headers']) {
      if (schemas[part]) req.valid[part] = schemas[part].parse(req[part]);
    }
    next();
  } catch (err) {
    next(err); // ZodError -> errorHandler (400 VALIDATION_ERROR)
  }
};

