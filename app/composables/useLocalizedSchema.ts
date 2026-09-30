// The zod schemas of shared/utils give translation keys as messages ("validation.maxChars"): this wraps one so
// that UForm shows its errors in the current language. Limits come from the issue itself ({min}, {max}).
interface Issue {
  message: string
  minimum?: number | bigint
  maximum?: number | bigint
}
interface Result {
  issues?: readonly Issue[]
}
interface StandardSchema {
  '~standard': { validate: (value: unknown) => Result | Promise<Result> }
}

// Typed as the original schema, so that UForm still infers the form's data.
export function useLocalizedSchema<T extends StandardSchema>(schema: T): T {
  const { t, te } = useI18n()

  const translate = (issue: Issue) => (te(issue.message)
    ? t(issue.message, { min: Number(issue.minimum), max: Number(issue.maximum) })
    : issue.message)

  return {
    '~standard': {
      ...schema['~standard'],
      validate: async (value: unknown) => {
        const result = await schema['~standard'].validate(value)
        return result.issues ? { ...result, issues: result.issues.map(issue => ({ ...issue, message: translate(issue) })) } : result
      },
    },
  } as unknown as T
}
