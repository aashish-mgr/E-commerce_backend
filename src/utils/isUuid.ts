const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Primary keys are uuid columns, so an unvalidated string from a query or param
// reaches postgres as `invalid input syntax for type uuid` and surfaces as a 500
// rather than an empty result. Anything meant to be compared against an id has to
// be checked before it is put into a where clause.
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value.trim());
