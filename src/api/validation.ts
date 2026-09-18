import type { z } from 'zod';
import { ValidationError } from '../shared/errors';

export interface ValidationIssue {
  path: string;
  message: string;
}

export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.output<Schema> {
  const result = schema.safeParse(input);

  if (!result.success) {
    const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    const summary = issues.map(({ path, message }) => (path ? `${path}: ${message}` : message));
    throw new ValidationError(summary.join('; '), issues);
  }

  return result.data;
}
